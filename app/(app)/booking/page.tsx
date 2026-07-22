"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/PageHero";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { StatusMarker } from "@/components/ui/StatusMarker";

type BookingConfig = {
  office_start_hour: number;
  office_end_hour: number;
  holidays: string[];
};

type Room = {
  id: string;
  name: string;
  capacity: number;
  equipment: string[];
};

// สีประจำห้อง (วนตามลำดับ) — แถบซ้ายการ์ด + ปุ่มเลือกห้อง ตามแบบ Claude Design
const ROOM_ACCENTS = [
  { left: "border-l-brand-primary", btn: "bg-brand-primary" },
  { left: "border-l-brand-accent", btn: "bg-brand-accent" },
  { left: "border-l-success-solid", btn: "bg-success-solid" },
  { left: "border-l-warning-accent", btn: "bg-warning-accent" },
  { left: "border-l-accent-pink", btn: "bg-accent-pink" },
  { left: "border-l-brand-deep", btn: "bg-brand-deep" },
];

// สี chip อุปกรณ์ประจำชนิดที่พบบ่อย (รองรับทั้งชื่อไทย/อังกฤษในฐานข้อมูล)
// ชนิดอื่นใช้โทนม่วงกลาง
const EQUIP_TAG: Record<string, string> = {
  โปรเจกเตอร์: "bg-tag-blue-surface text-tag-blue-text",
  projector: "bg-tag-blue-surface text-tag-blue-text",
  ไวท์บอร์ด: "bg-tag-orange-surface text-tag-orange-text",
  whiteboard: "bg-tag-orange-surface text-tag-orange-text",
  ไมโครโฟน: "bg-tag-pink-surface text-tag-pink-text",
  microphone: "bg-tag-pink-surface text-tag-pink-text",
  mic: "bg-tag-pink-surface text-tag-pink-text",
};
const EQUIP_TAG_DEFAULT = "bg-neutral-150 text-brand-primary-strong";

/* Step tracker ใต้หัว — วงกลม gradient เป็น accent เดียวของหัวหน้า (flat) */
function HeroStep({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex flex-none items-center gap-3">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full text-md font-extrabold transition-all duration-200 ${
          active || done
            ? "bg-grad-brand text-text-on-primary"
            : "border-2 border-neutral-300 bg-surface-card text-neutral-400"
        }`}
      >
        {done ? "✓" : n}
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-semibold text-text-muted">
          ขั้นตอนที่ {n}
        </span>
        <span
          className={`text-base font-bold ${
            active || done ? "text-text-primary" : "text-text-muted"
          }`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

export default function BookingPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [configError, setConfigError] = useState(false);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [rooms, setRooms] = useState<Room[]>([]);
  const [unavailableRoomIds, setUnavailableRoomIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState("");
  const [attendees, setAttendees] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refId, setRefId] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-booking-config`,
          {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );

        if (res.ok) {
          setConfig(await res.json());
        } else {
          setConfigError(true);
        }
      } catch {
        setConfigError(true);
      }
    }
    loadConfig();
  }, []);

  const minTime = config
    ? `${String(config.office_start_hour).padStart(2, "0")}:00`
    : undefined;
  const maxTime = config
    ? `${String(config.office_end_hour).padStart(2, "0")}:00`
    : undefined;
  const isHoliday = config ? config.holidays.includes(date) : false;

  async function handleSearch() {
    setSearching(true);
    setSearchError(null);
    setHasSearched(false);

    const supabase = createClient();
    const startISO = `${date}T${startTime}:00+07:00`;
    const endISO = `${date}T${endTime}:00+07:00`;

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("id, name, capacity, equipment")
      .neq("status", "maintenance")
      .order("capacity", { ascending: true });

    if (roomsError) {
      setSearchError("ไม่สามารถโหลดรายชื่อห้องได้ กรุณาลองใหม่อีกครั้ง");
      setSearching(false);
      return;
    }

    const { data: slots, error: slotsError } = await supabase
      .from("booking_slots")
      .select("room_id")
      .lt("start_time", endISO)
      .gt("end_time", startISO);

    if (slotsError) {
      setSearchError("ไม่สามารถตรวจสอบห้องว่างได้ กรุณาลองใหม่อีกครั้ง");
      setSearching(false);
      return;
    }

    setRooms(roomsData ?? []);
    setUnavailableRoomIds(
      new Set((slots ?? []).map((s: { room_id: string }) => s.room_id))
    );
    setHasSearched(true);
    setSearching(false);
  }

  function handleSelectRoom(room: Room) {
    setSelectedRoom(room);
    setStep(2);
  }

  const attendeesExceedsCapacity =
    selectedRoom !== null &&
    attendees !== "" &&
    Number(attendees) > selectedRoom.capacity;

  async function handleSubmit() {
    if (!selectedRoom) return;
    if (attendeesExceedsCapacity) return;

    setSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setSubmitError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSubmitting(false);
      return;
    }

    const startISO = `${date}T${startTime}:00+07:00`;
    const endISO = `${date}T${endTime}:00+07:00`;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-booking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_id: selectedRoom.id,
          title,
          activity,
          attendees: Number(attendees),
          start_time: startISO,
          end_time: endISO,
        }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      setSubmitError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setSubmitting(false);
      return;
    }

    setRefId(result.ref_id);
    setSubmitting(false);
  }

  function handleBackToSearch() {
    setStep(1);
    setSelectedRoom(null);
    setSubmitError(null);
  }

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="จองห้องประชุม"
        subtitle="ค้นหาห้องว่างและจองได้ในไม่กี่ขั้นตอน"
        width="max-w-2xl"
      >
        <div className="mt-4 flex max-w-md items-center">
          <HeroStep
            n={1}
            label="ค้นหาห้องว่าง"
            active={step === 1 && !refId}
            done={step === 2 || refId !== null}
          />
          <div
            className={`mx-4 h-px min-w-6 flex-1 ${
              step === 2 || refId !== null ? "bg-brand-primary" : "bg-neutral-200"
            }`}
          />
          <HeroStep
            n={2}
            label="รายละเอียดการจอง"
            active={step === 2 && !refId}
            done={refId !== null}
          />
        </div>
      </PageHeader>
      <div className="relative mx-auto mt-6 max-w-2xl px-6">
        {step === 1 && (
          <div className="space-y-4">
            {configError && (
              <p className="text-sm text-warning-text">
                ไม่สามารถโหลดเวลาทำการได้ กรุณาตรวจสอบเวลาทำการก่อนจอง
              </p>
            )}

            <EditorialCard accent="brand">
              <EditorialCard.Section>
                <SectionTitle>ค้นหาห้องว่าง</SectionTitle>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="flex flex-col gap-1 text-sm font-bold text-neutral-700">
                    วันที่
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="rounded-sm border-[1.5px] border-neutral-300 px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-bold text-neutral-700">
                    เวลาเริ่ม
                    <input
                      type="time"
                      value={startTime}
                      min={minTime}
                      max={maxTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="rounded-sm border-[1.5px] border-neutral-300 px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-bold text-neutral-700">
                    เวลาจบ
                    <input
                      type="time"
                      value={endTime}
                      min={minTime}
                      max={maxTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="rounded-sm border-[1.5px] border-neutral-300 px-3 py-2 font-normal"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-bold text-neutral-700">
                    จำนวนผู้เข้าร่วม
                    <input
                      type="number"
                      min={1}
                      value={attendees}
                      onChange={(e) => setAttendees(e.target.value)}
                      className="rounded-sm border-[1.5px] border-neutral-300 px-3 py-2 font-normal"
                    />
                  </label>
                </div>

                {isHoliday && (
                  <p className="mt-3 text-sm text-danger-text">
                    วันที่เลือกเป็นวันหยุด ไม่สามารถจองห้องได้
                  </p>
                )}

                <Button
                  onClick={handleSearch}
                  disabled={
                    !date || !startTime || !endTime || isHoliday || searching
                  }
                  className="mt-4"
                >
                  {searching ? "กำลังค้นหา..." : "ค้นหาห้องว่าง"}
                </Button>

                {searchError && (
                  <p className="mt-3 text-sm text-danger-text">{searchError}</p>
                )}
              </EditorialCard.Section>
            </EditorialCard>

            {searching && (
              <div className="space-y-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}

            {!searching &&
              hasSearched &&
              (() => {
                const att = Number(attendees) || 0;
                const fitRooms = rooms.filter(
                  (r) => att === 0 || r.capacity >= att
                );
                const availCount = fitRooms.filter(
                  (r) => !unavailableRoomIds.has(r.id)
                ).length;
                return (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                      <h3 className="text-md font-extrabold text-neutral-700">
                        {att > 0 ? `ห้องที่รองรับ ${att} คน` : "ผลการค้นหา"} ·{" "}
                        {startTime}–{endTime} น.
                      </h3>
                      <span className="text-sm font-bold text-brand-accent">
                        {availCount} ห้องว่าง
                      </span>
                    </div>

                    {fitRooms.length === 0 ? (
                      <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
                        ไม่พบห้องที่รองรับจำนวนผู้เข้าร่วม
                        ลองลดจำนวนผู้เข้าร่วมหรือเปลี่ยนช่วงเวลา
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {fitRooms.map((room, i) => {
                          const unavailable = unavailableRoomIds.has(room.id);
                          const acc = ROOM_ACCENTS[i % ROOM_ACCENTS.length];
                          return (
                            <div
                              key={room.id}
                              className={`flex flex-col gap-3 rounded-[2px] border border-neutral-300 border-l-[3px] ${acc.left} bg-surface-card p-4 ${
                                unavailable ? "opacity-50" : ""
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-md font-extrabold text-text-primary">
                                    {room.name}
                                  </p>
                                  <p className="mt-0.5 text-sm text-text-secondary">
                                    ความจุ {room.capacity} คน
                                  </p>
                                </div>
                                <StatusMarker
                                  tone={unavailable ? "neutral" : "success"}
                                >
                                  {unavailable ? "ไม่ว่างช่วงเวลานี้" : "ว่าง"}
                                </StatusMarker>
                              </div>

                              {room.equipment.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {room.equipment.map((eq) => (
                                    <span
                                      key={eq}
                                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                                        EQUIP_TAG[eq] ?? EQUIP_TAG_DEFAULT
                                      }`}
                                    >
                                      {eq}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <button
                                type="button"
                                disabled={unavailable}
                                onClick={() => handleSelectRoom(room)}
                                className={`mt-auto w-full rounded-sm py-2.5 text-sm font-bold transition-transform duration-150 ${
                                  unavailable
                                    ? "cursor-not-allowed bg-neutral-150 text-neutral-400"
                                    : `${acc.btn} text-text-on-primary hover:scale-[1.02] active:scale-[0.98]`
                                }`}
                              >
                                {unavailable ? "ไม่ว่าง" : "เลือกห้องนี้"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
          </div>
        )}

        {step === 2 && selectedRoom && !refId && (
          <EditorialCard accent="warning">
            <EditorialCard.Section>
              <SectionTitle>รายละเอียดการจอง</SectionTitle>

              <div className="mt-4 rounded-[2px] border border-border-sunken bg-surface-sunken p-3">
                <p className="text-xs font-bold tracking-wider text-text-muted">
                  ห้องที่เลือก
                </p>
                <p className="mt-1 text-lg font-extrabold text-text-primary">
                  {selectedRoom.name}
                </p>
                <p className="text-sm text-text-secondary">
                  ความจุ {selectedRoom.capacity} คน
                </p>
              </div>

              <div className="mt-4 space-y-4">
                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  ชื่อการประชุม
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-sm border border-neutral-300 px-3 py-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  รายละเอียดกิจกรรม
                  <textarea
                    value={activity}
                    onChange={(e) => setActivity(e.target.value)}
                    className="rounded-sm border border-neutral-300 px-3 py-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm text-text-secondary">
                  จำนวนผู้เข้าร่วม
                  <input
                    type="number"
                    value={attendees}
                    onChange={(e) => setAttendees(e.target.value)}
                    className="rounded-sm border border-neutral-300 px-3 py-2"
                  />
                </label>
              </div>

              {attendeesExceedsCapacity && (
                <p className="mt-3 text-sm text-danger-text">
                  จำนวนผู้เข้าร่วมเกินความจุห้อง
                </p>
              )}

              {submitError && (
                <p className="mt-3 text-sm text-danger-text">{submitError}</p>
              )}

              <div className="mt-4 flex gap-3">
                <Button variant="secondary" onClick={handleBackToSearch}>
                  กลับไปเลือกห้องใหม่
                </Button>
                <Button
                  variant="success"
                  onClick={handleSubmit}
                  disabled={
                    !title ||
                    !activity ||
                    !attendees ||
                    attendeesExceedsCapacity ||
                    submitting
                  }
                >
                  {submitting ? "กำลังบันทึก..." : "ยืนยันการจอง"}
                </Button>
              </div>
            </EditorialCard.Section>
          </EditorialCard>
        )}

        {refId && (
          <div className="rounded-[2px] border border-neutral-300 border-l-[3px] border-l-success-solid bg-surface-card p-8 text-center">
            <div className="bg-grad-success shadow-success mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl font-extrabold text-text-on-primary">
              ✓
            </div>
            <p className="mt-4 text-xl font-extrabold text-text-primary">
              จองห้องประชุมสำเร็จ
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              ระบบได้บันทึกการจองของคุณเรียบร้อยแล้ว
            </p>
            <p className="mt-4 inline-block rounded-[2px] border border-border-sunken bg-surface-sunken px-4 py-2 text-sm text-text-secondary">
              หมายเลขอ้างอิง:{" "}
              <span className="font-mono font-bold text-text-primary">
                {refId}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
