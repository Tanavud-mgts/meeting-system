"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/PageHero";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { Brand } from "@/components/ui/Brand";

type Room = {
  id: string;
  name: string;
  capacity: number;
};

type ChainUser = {
  id: string;
  full_name: string;
};

export default function SetupWizardPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoadError, setRoomsLoadError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("");
  const [roomFormError, setRoomFormError] = useState<string | null>(null);
  const [addingRoom, setAddingRoom] = useState(false);

  const [chainUsers, setChainUsers] = useState<ChainUser[]>([]);
  const [adminId, setAdminId] = useState("");
  const [approver1Id, setApprover1Id] = useState("");
  const [approver2Id, setApprover2Id] = useState("");

  const [officeStartHour, setOfficeStartHour] = useState("8");
  const [officeEndHour, setOfficeEndHour] = useState("17");
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState("");

  const [configLoadError, setConfigLoadError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  async function loadRooms() {
    setRoomsLoadError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, capacity")
      .order("name", { ascending: true });

    if (error) {
      setRoomsLoadError("ไม่สามารถโหลดรายการห้องได้");
      return;
    }

    setRooms((data ?? []) as Room[]);
  }

  async function loadChainAndConfig() {
    setConfigLoadError(null);
    const supabase = createClient();

    const [configRes, usersRes] = await Promise.all([
      supabase
        .from("system_config")
        .select(
          "admin_id, approver1_id, approver2_id, office_start_hour, office_end_hour, holidays"
        )
        .single(),
      supabase
        .from("users")
        .select("id, full_name")
        .in("role", ["approver", "admin"])
        .order("full_name", { ascending: true }),
    ]);

    if (configRes.error || usersRes.error) {
      setConfigLoadError("ไม่สามารถโหลดข้อมูลการตั้งค่าได้");
      return;
    }

    setChainUsers((usersRes.data ?? []) as ChainUser[]);
    setAdminId(configRes.data.admin_id ?? "");
    setApprover1Id(configRes.data.approver1_id ?? "");
    setApprover2Id(configRes.data.approver2_id ?? "");
    setOfficeStartHour(String(configRes.data.office_start_hour));
    setOfficeEndHour(String(configRes.data.office_end_hour));
    setHolidays((configRes.data.holidays ?? []) as string[]);
  }

  useEffect(() => {
    loadRooms();
    loadChainAndConfig();
  }, []);

  async function handleAddRoom() {
    const capacityNum = Number(roomCapacity);

    if (roomName.trim().length === 0) {
      setRoomFormError("กรุณากรอกชื่อห้อง");
      return;
    }

    if (!Number.isInteger(capacityNum) || capacityNum <= 0) {
      setRoomFormError("จำนวนที่นั่งต้องมากกว่า 0");
      return;
    }

    setAddingRoom(true);
    setRoomFormError(null);

    const supabase = createClient();
    const { error } = await supabase.from("rooms").insert({
      name: roomName.trim(),
      capacity: capacityNum,
    });

    if (error) {
      setRoomFormError("เพิ่มห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setAddingRoom(false);
      return;
    }

    setRoomName("");
    setRoomCapacity("");
    setAddingRoom(false);
    await loadRooms();
  }

  function addHoliday() {
    if (newHoliday && !holidays.includes(newHoliday)) {
      setHolidays([...holidays, newHoliday].sort());
      setNewHoliday("");
    }
  }

  function removeHoliday(date: string) {
    setHolidays(holidays.filter((h) => h !== date));
  }

  async function handleFinish() {
    setFinishing(true);
    setFinishError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setFinishError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setFinishing(false);
      return;
    }

    try {
      const chainRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-approval-chain`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            admin_id: adminId,
            approver1_id: approver1Id,
            approver2_id: approver2Id,
            office_start_hour: Number(officeStartHour),
            office_end_hour: Number(officeEndHour),
            holidays,
          }),
        }
      );

      const chainResult = await chainRes.json();

      if (!chainRes.ok) {
        setFinishError(
          chainResult.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
        );
        return;
      }

      const completeRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/complete-setup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const completeResult = await completeRes.json();

      if (!completeRes.ok) {
        setFinishError(
          completeResult.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
        );
        return;
      }

      router.push("/dashboard");
    } catch {
      setFinishError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setFinishing(false);
    }
  }

  const totalRooms = rooms.length;

  return (
    <div className="bg-page-wash min-h-screen animate-fade-in-up pb-10">
      <div className="flex justify-center pt-8">
        <Brand size="lg" />
      </div>
      <PageHeader
        title="ตั้งค่าระบบเริ่มต้น"
        subtitle={`ขั้นตอน ${step} / 4`}
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">

      {step === 1 && (
        <EditorialCard>
          <EditorialCard.Section>
          <p className="text-text-primary">
            ยินดีต้อนรับสู่ระบบจองห้องประชุม LPRU ก่อนเริ่มใช้งาน
            กรุณาตั้งค่าเริ่มต้น 3 ขั้นตอน ได้แก่ เพิ่มห้องประชุม, กำหนด
            Approval Chain, และเวลาทำการ
          </p>
          <Button onClick={() => setStep(2)} className="mt-4">
            เริ่มต้น
          </Button>
          </EditorialCard.Section>
        </EditorialCard>
      )}

      {step === 2 && (
        <EditorialCard>
          <EditorialCard.Section>
          <SectionTitle>เพิ่มห้องประชุม</SectionTitle>

          {roomsLoadError && (
            <p className="mt-2 text-sm text-danger-text">{roomsLoadError}</p>
          )}

          <div className="mt-3 space-y-2">
            {rooms.map((r) => (
              <div key={r.id} className="text-sm text-text-primary">
                {r.name} (จุ {r.capacity} คน)
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-sm text-text-secondary">ยังไม่มีห้อง</p>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <input
              type="text"
              placeholder="ชื่อห้อง"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-1/2 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <input
              type="number"
              min={1}
              placeholder="จำนวนที่นั่ง"
              value={roomCapacity}
              onChange={(e) => setRoomCapacity(e.target.value)}
              className="w-1/3 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <Button variant="secondary" onClick={handleAddRoom} disabled={addingRoom}>
              {addingRoom ? "กำลังเพิ่ม..." : "เพิ่ม"}
            </Button>
          </div>
          {roomFormError && (
            <p className="mt-2 text-sm text-danger-text">{roomFormError}</p>
          )}

          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(1)}>
              ย้อนกลับ
            </Button>
            <Button onClick={() => setStep(3)} disabled={totalRooms === 0}>
              ถัดไป
            </Button>
          </div>
          </EditorialCard.Section>
        </EditorialCard>
      )}

      {step === 3 && (
        <EditorialCard>
          <EditorialCard.Section>
          <SectionTitle>Approval Chain</SectionTitle>

          {configLoadError && (
            <p className="mt-2 text-sm text-danger-text">{configLoadError}</p>
          )}

          <div className="mt-3 space-y-3">
            <div>
              <label className="text-sm text-text-secondary">
                Admin (ขั้นที่ 1)
              </label>
              <select
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              >
                <option value="">-- เลือก --</option>
                {chainUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-text-secondary">
                Approver 1 (ขั้นที่ 2)
              </label>
              <select
                value={approver1Id}
                onChange={(e) => setApprover1Id(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              >
                <option value="">-- เลือก --</option>
                {chainUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-text-secondary">
                Approver 2 (ขั้นที่ 3)
              </label>
              <select
                value={approver2Id}
                onChange={(e) => setApprover2Id(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              >
                <option value="">-- เลือก --</option>
                {chainUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>
              ย้อนกลับ
            </Button>
            <Button onClick={() => setStep(4)}>
              ถัดไป
            </Button>
          </div>
          </EditorialCard.Section>
        </EditorialCard>
      )}

      {step === 4 && (
        <EditorialCard>
          <EditorialCard.Section>
          <SectionTitle>เวลาทำการ</SectionTitle>

          <div className="mt-3 flex gap-3">
            <div>
              <label className="text-sm text-text-secondary">
                เปิด (ชม.)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={officeStartHour}
                onChange={(e) => setOfficeStartHour(e.target.value)}
                className="mt-1 w-24 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary">
                ปิด (ชม.)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={officeEndHour}
                onChange={(e) => setOfficeEndHour(e.target.value)}
                className="mt-1 w-24 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
          </div>

          <p className="mt-4 font-bold text-text-primary">วันหยุด</p>
          <div className="mt-2 flex gap-3">
            <input
              type="date"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
              className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <Button variant="secondary" onClick={addHoliday}>
              เพิ่ม
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {holidays.map((h) => (
              <div key={h} className="flex items-center justify-between">
                <span className="text-sm text-text-primary">{h}</span>
                <button
                  type="button"
                  onClick={() => removeHoliday(h)}
                  className="text-sm text-danger-text"
                >
                  ลบ
                </button>
              </div>
            ))}
            {holidays.length === 0 && (
              <p className="text-sm text-text-secondary">ยังไม่มีวันหยุด</p>
            )}
          </div>

          {finishError && (
            <p className="mt-4 text-sm text-danger-text">{finishError}</p>
          )}

          <div className="mt-4 flex justify-between">
            <Button variant="secondary" onClick={() => setStep(3)}>
              ย้อนกลับ
            </Button>
            <Button onClick={handleFinish} disabled={finishing}>
              {finishing ? "กำลังบันทึก..." : "เสร็จสิ้น"}
            </Button>
          </div>
          </EditorialCard.Section>
        </EditorialCard>
      )}
      </div>
    </div>
  );
}
