"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ChainUser = {
  id: string;
  full_name: string;
};

export default function DashboardSettingsPage() {
  const [chainUsers, setChainUsers] = useState<ChainUser[]>([]);
  const [adminId, setAdminId] = useState("");
  const [approver1Id, setApprover1Id] = useState("");
  const [approver2Id, setApprover2Id] = useState("");
  const [officeStartHour, setOfficeStartHour] = useState("8");
  const [officeEndHour, setOfficeEndHour] = useState("17");
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadSettings() {
    setLoading(true);
    setLoadError(null);

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
      setLoadError("ไม่สามารถโหลดการตั้งค่าได้");
      setLoading(false);
      return;
    }

    setChainUsers((usersRes.data ?? []) as ChainUser[]);
    setAdminId(configRes.data.admin_id ?? "");
    setApprover1Id(configRes.data.approver1_id ?? "");
    setApprover2Id(configRes.data.approver2_id ?? "");
    setOfficeStartHour(String(configRes.data.office_start_hour));
    setOfficeEndHour(String(configRes.data.office_end_hour));
    setHolidays((configRes.data.holidays ?? []) as string[]);
    setLoading(false);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function addHoliday() {
    if (newHoliday && !holidays.includes(newHoliday)) {
      setHolidays([...holidays, newHoliday].sort());
      setNewHoliday("");
    }
  }

  function removeHoliday(date: string) {
    setHolidays(holidays.filter((h) => h !== date));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setFormError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSubmitting(false);
      return;
    }

    const res = await fetch(
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

    const result = await res.json();

    setSubmitting(false);

    if (!res.ok) {
      setFormError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    setSuccessMessage("บันทึกการตั้งค่าสำเร็จ");
    await loadSettings();
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ตั้งค่าระบบ
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {formError && (
        <p className="mt-4 text-sm text-danger-text">{formError}</p>
      )}
      {successMessage && (
        <p className="mt-4 text-sm text-success-text">{successMessage}</p>
      )}

      {!loading && !loadError && (
        <div className="mt-4 space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <p className="font-medium text-text-primary">Approval Chain</p>
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
          </div>

          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <p className="font-medium text-text-primary">เวลาทำการ</p>
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
          </div>

          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <p className="font-medium text-text-primary">วันหยุด</p>
            <div className="mt-3 flex gap-3">
              <input
                type="date"
                value={newHoliday}
                onChange={(e) => setNewHoliday(e.target.value)}
                className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
              <button
                type="button"
                onClick={addHoliday}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                เพิ่ม
              </button>
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
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
          >
            {submitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </button>
        </div>
      )}
    </div>
  );
}
