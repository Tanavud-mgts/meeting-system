import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendDiscord } from "./discordClient.ts";
import { sendWelpruPush } from "./welpruClient.ts";
import { logIntegration } from "./integrationLog.ts";

// ── Template ──────────────────────────────────────────────
export function applyTemplate(
  template: string,
  vars?: Record<string, string>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? vars[key] : `{${key}}`
  );
}

// ── Thai date/time formatters (Asia/Bangkok, เลขอารบิก) ────
const TZ = "Asia/Bangkok";

export function formatThaiDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(new Date(iso));
}

function formatThaiTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatThaiTimeRange(startIso: string, endIso: string): string {
  return `${formatThaiTime(startIso)}–${formatThaiTime(endIso)} น.`;
}

// ── Event registry ────────────────────────────────────────
export type EventKey =
  | "booking_submitted"
  | "booking_step_approved"
  | "booking_approved"
  | "booking_rejected"
  | "cancellation_requested"
  | "cancellation_approved"
  | "cancellation_denied"
  | "booking_cancelled";

interface EventDefault {
  title: string;
  body: string;
  link: string;
}

const EVENT_DEFAULTS: Record<EventKey, EventDefault> = {
  booking_submitted: {
    title: "🔔 มีคำขอจองห้องประชุมใหม่",
    body: "{booker} ขอจอง{room} วันที่ {date} เวลา {time} โปรดพิจารณาอนุมัติ",
    link: "/approver",
  },
  booking_step_approved: {
    title: "🔔 มีคำขอจองรอท่านพิจารณา",
    body: "{booker} ขอจอง{room} วันที่ {date} เวลา {time} ผ่านการอนุมัติขั้นก่อนหน้าแล้ว",
    link: "/approver",
  },
  booking_approved: {
    title: "✅ การจองได้รับอนุมัติแล้ว",
    body: "การจอง{room} วันที่ {date} เวลา {time} ได้รับอนุมัติเรียบร้อยแล้ว",
    link: "/profile/bookings",
  },
  booking_rejected: {
    title: "❌ การจองไม่ได้รับอนุมัติ",
    body: "การจอง{room} วันที่ {date} ไม่ได้รับอนุมัติ เหตุผล: {reason}",
    link: "/profile/bookings",
  },
  cancellation_requested: {
    title: "🔔 มีคำขอยกเลิกการจอง",
    body: "{booker} ขอยกเลิกการจอง{room} วันที่ {date} เหตุผล: {reason}",
    link: "/approver/cancel-requests",
  },
  cancellation_approved: {
    title: "✅ คำขอยกเลิกได้รับอนุมัติ",
    body: "การจอง{room} วันที่ {date} ถูกยกเลิกเรียบร้อยแล้ว",
    link: "/profile/bookings",
  },
  cancellation_denied: {
    title: "❌ คำขอยกเลิกไม่ได้รับอนุมัติ",
    body: "การจอง{room} วันที่ {date} ยังมีผลตามเดิม เหตุผล: {reason}",
    link: "/profile/bookings",
  },
  booking_cancelled: {
    title: "⚠️ การจองของท่านถูกยกเลิก",
    body: "การจอง{room} วันที่ {date} เวลา {time} ถูกยกเลิก เหตุผล: {reason}",
    link: "/profile/bookings",
  },
};

export interface EventOverride {
  discord?: boolean;
  welpru?: boolean;
  title?: string | null;
  body?: string | null;
}

export function buildNotification(
  eventKey: EventKey,
  vars: Record<string, string>,
  override?: EventOverride
): { title: string; body: string; link: string } {
  const def = EVENT_DEFAULTS[eventKey];
  const titleTemplate = override?.title ?? def.title;
  const bodyTemplate = override?.body ?? def.body;
  return {
    title: applyTemplate(titleTemplate, vars),
    body: applyTemplate(bodyTemplate, vars),
    link: def.link,
  };
}

// ── Discord message templates (รูปแบบสั้น ต่างจาก in-app/WeLPRU) ──
const DISCORD_MESSAGE_TEMPLATES: Record<EventKey, string> = {
  booking_submitted: "📥 คำขอใหม่ — {booker} จอง {room} · {date} {time} (รออนุมัติขั้นที่ 1)",
  booking_step_approved: "⏫ ผ่านขั้นที่ {step} — {room} · {date} (ต่อคิว: {approver})",
  booking_approved: "✅ อนุมัติครบ — {room} · {date} {time} ({booker})",
  booking_rejected: "❌ ปฏิเสธขั้นที่ {step} — {room} · {date} ({booker})",
  cancellation_requested: "🗑️ ขอยกเลิก — {booker} · {room} · {date}",
  cancellation_approved: "✅ ยกเลิกแล้ว — {room} · {date}",
  cancellation_denied: "❌ ไม่อนุมัติยกเลิก — {room} · {date}",
  booking_cancelled: "⚠️ Admin ยกเลิก — {room} · {date}",
};

function buildDiscordMessage(eventKey: EventKey, vars: Record<string, string>): string {
  return applyTemplate(DISCORD_MESSAGE_TEMPLATES[eventKey], vars);
}

export interface NotifyRecipient {
  userId: string;
}

export interface NotifyParams {
  eventKey: EventKey;
  recipients: NotifyRecipient[];
  variables: Record<string, string>;
}

// ★ Fire-and-Forget: insert แจ้งเตือน in-app รายผู้รับ ไม่ throw เด็ดขาด
export async function notifyAndLog(
  client: SupabaseClient,
  params: NotifyParams
): Promise<void> {
  if (params.recipients.length === 0) return;

  const cfg = await loadNotificationConfig(client);
  const override = getEventOverride(cfg, params.eventKey);
  const { title, body, link } = buildNotification(params.eventKey, params.variables, override);

  // 1. In-App inserts (เหมือนเฟส 1 ทุกประการ)
  const tasks = params.recipients.map((r) =>
    client.from("notifications").insert({
      user_id: r.userId,
      event_key: params.eventKey,
      title,
      body,
      link,
    })
  );

  const results = await Promise.allSettled(tasks);
  results.forEach((res, i) => {
    if (res.status === "rejected") {
      console.error(`[notifyAndLog] insert ล้มเหลว (recipient ${i}):`, res.reason);
    } else if (res.value && (res.value as { error?: unknown }).error) {
      console.error(
        `[notifyAndLog] insert error (recipient ${i}):`,
        (res.value as { error?: unknown }).error
      );
    }
  });

  // 2. Discord (ข้อความเดียวต่อเหตุการณ์)
  if (cfg.discordEnabled && override.discord !== false) {
    try {
      const discordMessage = buildDiscordMessage(params.eventKey, params.variables);
      await sendDiscord(discordMessage);
      await logIntegration(client, { service: "discord", status: "success" });
    } catch (err) {
      console.error("[notifyAndLog] discord ล้มเหลว:", err);
      await logIntegration(client, {
        service: "discord",
        status: "failed",
        error_detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. WeLPRU (เฉพาะผู้รับที่ verified แล้ว)
  if (cfg.welpruEnabled && override.welpru !== false) {
    const staffIds: string[] = [];
    for (const r of params.recipients) {
      const staffId = await loadWelpruStaffId(client, r.userId);
      if (staffId) staffIds.push(staffId);
    }
    if (staffIds.length > 0) {
      try {
        const result = await sendWelpruPush({ staffIds, title, body, link });
        await logIntegration(client, {
          service: "welpru",
          status: result.success ? "success" : "failed",
          payload: { failedCount: result.failedCount, recipientCount: staffIds.length },
        });
      } catch (err) {
        console.error("[notifyAndLog] welpru ล้มเหลว:", err);
        await logIntegration(client, {
          service: "welpru",
          status: "failed",
          error_detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}

// ── System config loading (master toggles + per-event override) ──
interface NotificationConfig {
  welpruEnabled: boolean;
  discordEnabled: boolean;
  settings: Record<string, EventOverride>;
}

const CONFIG_DISABLED: NotificationConfig = {
  welpruEnabled: false,
  discordEnabled: false,
  settings: {},
};

// ★ ต้องไม่ throw เด็ดขาด — ห่อ try/catch เพราะจุดเรียก (notifyAndLog) ไม่มี
//   try/catch รอบ config load และ query อาจ reject (ไม่ใช่แค่ resolve-with-error)
//   ถ้า config อ่านไม่ได้ไม่ว่าเหตุใด → ปิดทุกช่องทางใหม่ ปล่อย in-app ทำงานต่อ
async function loadNotificationConfig(client: SupabaseClient): Promise<NotificationConfig> {
  try {
    const { data, error } = await client
      .from("system_config")
      .select("welpru_enabled, discord_enabled, notification_settings")
      .single();
    if (error || !data) return CONFIG_DISABLED;
    const row = data as {
      welpru_enabled: boolean | null;
      discord_enabled: boolean | null;
      notification_settings: Record<string, EventOverride> | null;
    };
    return {
      welpruEnabled: row.welpru_enabled ?? false,
      discordEnabled: row.discord_enabled ?? false,
      settings: row.notification_settings ?? {},
    };
  } catch (err) {
    console.error("[notifyAndLog] loadNotificationConfig ล้มเหลว:", err);
    return CONFIG_DISABLED;
  }
}

function getEventOverride(cfg: NotificationConfig, eventKey: EventKey): EventOverride {
  return cfg.settings[eventKey] ?? {};
}

// ── WeLPRU eligibility (ต้องมี staff_id + verified แล้ว) ──
// ★ ต้องไม่ throw เด็ดขาด — เรียกใน loop นอก try/catch ของ welpru branch
async function loadWelpruStaffId(client: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("users")
      .select("staff_id, welpru_verified_at")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    const row = data as { staff_id: string | null; welpru_verified_at: string | null };
    if (!row.staff_id || !row.welpru_verified_at) return null;
    return row.staff_id;
  } catch (err) {
    console.error("[notifyAndLog] loadWelpruStaffId ล้มเหลว:", err);
    return null;
  }
}
