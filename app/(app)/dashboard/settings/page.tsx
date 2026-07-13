"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EVENT_META, CHANNEL_LABEL, PREVIEW_VARS, applyTemplate, type Channel } from "@/lib/notifications/eventMeta";

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

  // per-event editor state: channelOff = ช่องที่ปิด, title/body = "" หมายถึงใช้ default
  type NotifEventState = {
    channelOff: Partial<Record<Channel, boolean>>;
    title: string;
    body: string;
  };
  const [welpruEnabled, setWelpruEnabled] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [lineEnabled, setLineEnabled] = useState(false);
  const [notifState, setNotifState] = useState<Record<string, NotifEventState>>({});
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [notifSuccess, setNotifSuccess] = useState<string | null>(null);

  async function loadSettings() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();

    const [configRes, usersRes] = await Promise.all([
      supabase
        .from("system_config")
        .select(
          "admin_id, approver1_id, approver2_id, office_start_hour, office_end_hour, holidays, welpru_enabled, discord_enabled, line_enabled, notification_settings"
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
    setWelpruEnabled(configRes.data.welpru_enabled ?? false);
    setDiscordEnabled(configRes.data.discord_enabled ?? false);
    setLineEnabled(configRes.data.line_enabled ?? false);
    const saved = (configRes.data.notification_settings ?? {}) as Record<
      string,
      { discord?: boolean; welpru?: boolean; line?: boolean; title?: string | null; body?: string | null }
    >;
    const initial: Record<string, NotifEventState> = {};
    for (const m of EVENT_META) {
      const s = saved[m.key] ?? {};
      const channelOff: Partial<Record<Channel, boolean>> = {};
      for (const ch of m.channels) if (s[ch] === false) channelOff[ch] = true;
      initial[m.key] = { channelOff, title: s.title ?? "", body: s.body ?? "" };
    }
    setNotifState(initial);
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

    try {
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

      if (!res.ok) {
        setFormError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setSuccessMessage("บันทึกการตั้งค่าสำเร็จ");
      await loadSettings();
    } catch {
      setFormError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  function buildNotificationSettings() {
    const out: Record<string, Record<string, unknown>> = {};
    for (const m of EVENT_META) {
      const st = notifState[m.key];
      if (!st) continue;
      const entry: Record<string, unknown> = {};
      for (const ch of m.channels) if (st.channelOff[ch]) entry[ch] = false;
      if (st.title.trim()) entry.title = st.title.trim();
      if (st.body.trim()) entry.body = st.body.trim();
      if (Object.keys(entry).length > 0) out[m.key] = entry;
    }
    return out;
  }

  async function handleSaveNotif() {
    setNotifSaving(true);
    setNotifError(null);
    setNotifSuccess(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setNotifError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setNotifSaving(false);
      return;
    }
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-notification-settings`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            welpru_enabled: welpruEnabled,
            discord_enabled: discordEnabled,
            line_enabled: lineEnabled,
            notification_settings: buildNotificationSettings(),
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) {
        setNotifError(result.message ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      setNotifSuccess("บันทึกการตั้งค่าแจ้งเตือนสำเร็จ");
      await loadSettings();
    } catch {
      setNotifError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setNotifSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
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

      {loading && (
        <div className="mt-4 space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {!loading && !loadError && (
        <div className="mt-4 space-y-6">
          <Card>
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
          </Card>

          <Card>
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
          </Card>

          <Card>
            <p className="font-medium text-text-primary">วันหยุด</p>
            <div className="mt-3 flex gap-3">
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
          </Card>

          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>

          <Card>
            <p className="font-medium text-text-primary">ช่องทางแจ้งเตือน (เปิด/ปิดทั้งระบบ)</p>
            <p className="mt-1 text-sm text-text-secondary">
              การแจ้งเตือนในระบบ (in-app) ทำงานเสมอ — สวิตช์นี้ควบคุมช่องทางเสริม
            </p>
            <div className="mt-3 space-y-2">
              {([
                ["discord", discordEnabled, setDiscordEnabled],
                ["welpru", welpruEnabled, setWelpruEnabled],
                ["line", lineEnabled, setLineEnabled],
              ] as const).map(([ch, val, setter]) => (
                <label key={ch} className="flex items-center gap-2 text-sm text-text-primary">
                  <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)} />
                  {CHANNEL_LABEL[ch as Channel]}
                </label>
              ))}
            </div>
          </Card>

          {/* Task 5 จะเพิ่ม per-event Card ตรงนี้ */}

          {notifError && <p className="text-sm text-danger-text">{notifError}</p>}
          {notifSuccess && <p className="text-sm text-success-text">{notifSuccess}</p>}
          <Button onClick={handleSaveNotif} disabled={notifSaving}>
            {notifSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่าแจ้งเตือน"}
          </Button>
        </div>
      )}
    </div>
  );
}
