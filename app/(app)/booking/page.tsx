"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

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
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">จองห้องประชุม</h1>

      {step === 1 && (
        <div className="mt-6 space-y-4">
          {configError && (
            <p className="text-sm text-warning-text">
              ไม่สามารถโหลดเวลาทำการได้ กรุณาตรวจสอบเวลาทำการก่อนจอง
            </p>
          )}

          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                วันที่
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                เวลาเริ่ม
                <input
                  type="time"
                  value={startTime}
                  min={minTime}
                  max={maxTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                เวลาจบ
                <input
                  type="time"
                  value={endTime}
                  min={minTime}
                  max={maxTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
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
              disabled={!date || !startTime || !endTime || isHoliday || searching}
              className="mt-4"
            >
              {searching ? "กำลังค้นหา..." : "ค้นหาห้องว่าง"}
            </Button>

            {searchError && (
              <p className="mt-3 text-sm text-danger-text">{searchError}</p>
            )}
          </Card>

          {searching && (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {!searching && hasSearched && (
            <div className="space-y-2">
              {rooms.map((room) => {
                const unavailable = unavailableRoomIds.has(room.id);
                return (
                  <button
                    key={room.id}
                    type="button"
                    disabled={unavailable}
                    onClick={() => handleSelectRoom(room)}
                    className={`w-full rounded-lg border border-neutral-200 bg-surface-card p-4 text-left shadow-card transition-shadow duration-150 ${
                      unavailable
                        ? "opacity-40"
                        : "hover:bg-neutral-50 hover:shadow-raised"
                    }`}
                  >
                    <p className="font-medium text-text-primary">{room.name}</p>
                    <p className="text-sm text-text-secondary">
                      ความจุ {room.capacity} คน
                      {unavailable && " — ไม่ว่างในช่วงเวลานี้"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 2 && selectedRoom && !refId && (
        <Card className="mt-6 space-y-4">
          <p className="text-sm text-text-secondary">
            ห้อง: {selectedRoom.name} (ความจุ {selectedRoom.capacity} คน)
          </p>

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

          {attendeesExceedsCapacity && (
            <p className="text-sm text-danger-text">
              จำนวนผู้เข้าร่วมเกินความจุห้อง
            </p>
          )}

          {submitError && (
            <p className="text-sm text-danger-text">{submitError}</p>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleBackToSearch}>
              กลับไปเลือกห้องใหม่
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !title || !activity || !attendees || attendeesExceedsCapacity || submitting
              }
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันการจอง"}
            </Button>
          </div>
        </Card>
      )}

      {refId && (
        <div className="mt-6 rounded-lg border border-success-accent bg-success-surface p-5 shadow-card">
          <p className="font-medium text-success-text">จองห้องสำเร็จ</p>
          <p className="mt-1 text-sm text-success-text">
            หมายเลขอ้างอิง: {refId}
          </p>
        </div>
      )}
    </div>
  );
}
