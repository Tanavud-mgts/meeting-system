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

  function updateNotif(key: string, patch: Partial<NotifEventState>) {
    setNotifState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function toggleChannel(key: string, ch: Channel) {
    setNotifState((prev) => {
      const cur = prev[key];
      const channelOff = { ...cur.channelOff, [ch]: !cur.channelOff[ch] };
      return { ...prev, [key]: { ...cur, channelOff } };
    });
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

          <Card>
            <p className="font-medium text-text-primary">ตั้งค่ารายเหตุการณ์</p>
            <p className="mt-1 text-sm text-text-secondary">
              เปิด/ปิดช่องทางและแก้ข้อความแต่ละเหตุการณ์ — เว้นว่างข้อความไว้เพื่อใช้ค่าเริ่มต้น
            </p>
            <div className="mt-4 space-y-6">
              {EVENT_META.map((m) => {
                const st = notifState[m.key];
                if (!st) return null;
                const titleLen = st.title.trim().length;
                const bodyLen = st.body.trim().length;
                const previewTitle = applyTemplate(st.title.trim() || m.defaultTitle, PREVIEW_VARS);
                const previewBody = applyTemplate(st.body.trim() || m.defaultBody, PREVIEW_VARS);
                return (
                  <div key={m.key} className="border-t border-neutral-100 pt-4 first:border-0 first:pt-0">
                    <p className="text-sm font-medium text-text-primary">{m.label}</p>

                    <div className="mt-2 flex flex-wrap gap-4">
                      {m.channels.map((ch) => (
                        <label key={ch} className="flex items-center gap-2 text-sm text-text-secondary">
                          <input
                            type="checkbox"
                            checked={!st.channelOff[ch]}
                            onChange={() => toggleChannel(m.key, ch)}
                          />
                          {CHANNEL_LABEL[ch]}
                        </label>
                      ))}
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-text-secondary">หัวข้อ</label>
                          <span className={`text-xs ${titleLen > 200 ? "text-danger-text" : "text-text-muted"}`}>
                            {titleLen}/200
                          </span>
                        </div>
                        <input
                          type="text"
                          value={st.title}
                          placeholder={m.defaultTitle}
                          onChange={(e) => updateNotif(m.key, { title: e.target.value })}
                          maxLength={200}
                          className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-text-secondary">เนื้อหา</label>
                          <span className={`text-xs ${bodyLen > 1000 ? "text-danger-text" : "text-text-muted"}`}>
                            {bodyLen}/1000
                          </span>
                        </div>
                        <textarea
                          value={st.body}
                          placeholder={m.defaultBody}
                          onChange={(e) => updateNotif(m.key, { body: e.target.value })}
                          rows={2}
                          maxLength={1000}
                          className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                        />
                      </div>
                      {(st.title.trim() || st.body.trim()) && (
                        <button
                          type="button"
                          onClick={() => updateNotif(m.key, { title: "", body: "" })}
                          className="text-xs text-brand-primary hover:underline"
                        >
                          คืนค่าเริ่มต้น
                        </button>
                      )}
                    </div>

                    <div className="mt-2 rounded-sm bg-neutral-100 px-3 py-2">
                      <p className="text-xs text-text-muted">ตัวอย่าง:</p>
                      <p className="text-sm font-medium text-text-primary">{previewTitle}</p>
                      <p className="text-sm text-text-secondary">{previewBody}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

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
