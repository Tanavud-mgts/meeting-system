import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { sendDiscord } from "./discordClient.ts";
import { sendWelpruPush } from "./welpruClient.ts";
import { logIntegration } from "./integrationLog.ts";
import { pushFlex, buildApprovalFlex } from "./lineClient.ts";
import { createOrReuseApprovalToken } from "./lineApproval.ts";

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
  | "booking_cancelled"
  | "line_quota_warning"
  | "calendar_sync_failed"
  | "make_quota_warning";

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
  line_quota_warning: {
    title: "⚠️ โควตา LINE ใกล้เต็ม",
    body: "เดือนนี้ส่งไปแล้ว {sent}/500 ข้อความ เมื่อครบโควตาระบบจะหยุดส่งทาง LINE อัตโนมัติ",
    link: "/dashboard/integrations",
  },
  calendar_sync_failed: {
    title: "⚠️ ซิงก์ปฏิทินไม่สำเร็จ",
    body: "การจอง [{ref_id}] {room} วันที่ {date} — ซิงก์ปฏิทิน ({action}) ไม่สำเร็จ ระบบบันทึกการจองไว้ถูกต้องแล้ว โปรดตรวจสอบที่หน้าเชื่อมต่อระบบ",
    link: "/dashboard/integrations",
  },
  make_quota_warning: {
    title: "⚠️ โควตา Make.com ใกล้เต็ม",
    body: "เดือนนี้ใช้ไปแล้ว {used}/{limit} operations ({percent}%) เมื่อครบโควตาการซิงก์ปฏิทินจะหยุดจนถึงรอบถัดไป",
    link: "/dashboard/integrations",
  },
};

// รายชื่อ event keys ทั้งหมด (source of truth สำหรับ validator/UI) — ต้องครบตาม EventKey
export const EVENT_KEYS: EventKey[] = [
  "booking_submitted",
  "booking_step_approved",
  "booking_approved",
  "booking_rejected",
  "cancellation_requested",
  "cancellation_approved",
  "cancellation_denied",
  "booking_cancelled",
  "line_quota_warning",
  "calendar_sync_failed",
  "make_quota_warning",
];

export interface EventOverride {
  discord?: boolean;
  welpru?: boolean;
  line?: boolean;
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
  line_quota_warning: "⚠️ LINE quota: {sent}/500",
  calendar_sync_failed: "⚠️ ปฏิทินซิงก์ไม่สำเร็จ ({action}) — [{ref_id}] {room} · {date}",
  make_quota_warning: "⚠️ Make.com quota: {used}/{limit} ({percent}%)",
};

export function buildDiscordMessage(eventKey: EventKey, vars: Record<string, string>): string {
  return applyTemplate(DISCORD_MESSAGE_TEMPLATES[eventKey], vars);
}

export interface NotifyRecipient {
  userId: string;
}

export interface NotifyParams {
  eventKey: EventKey;
  recipients: NotifyRecipient[];
  variables: Record<string, string>;
  lineApproval?: { bookingId: string; step: number; approverId: string };
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

  // 3. WeLPRU (เฉพาะผู้รับที่ verified แล้ว — ยกเว้น line_quota_warning ที่ไป in-app+Discord เท่านั้น)
  if (cfg.welpruEnabled && override.welpru !== false && params.eventKey !== "line_quota_warning") {
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
          error_detail: result.success ? undefined : result.detail,
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

  // 4. LINE (เฉพาะ 2 event ปุ่ม — ต้องมี lineApproval + line_user_id + quota ไม่เต็ม)
  if (cfg.lineEnabled && override.line !== false && params.lineApproval) {
    try {
      const lineUserId = await loadLineUserId(client, params.lineApproval.approverId);
      if (lineUserId) {
        const sent = await countLinePushesThisMonth(client);
        if (sent >= 500) {
          await logIntegration(client, {
            service: "internal",
            status: "success",
            payload: { skipped: "line_quota", sent },
          });
        } else {
          const tokenId = await createOrReuseApprovalToken(client, params.lineApproval);
          if (tokenId) {
            // เตือน quota ก่อน push (push นี้จะทำให้ยอด ≥400) — วางก่อน push เพื่อให้
            // logic นี้ทดสอบได้จริง (pushFlex throw ใน test env เพราะไม่มี Deno.env)
            if (sent + 1 >= 400) {
              await maybeFireQuotaWarning(client, sent + 1);
            }
            const flex = buildApprovalFlex(
              {
                booker: params.variables.booker ?? "",
                room: params.variables.room ?? "",
                date: params.variables.date ?? "",
                time: params.variables.time ?? "",
              },
              tokenId,
              title
            );
            await pushFlex(lineUserId, flex);
            await logIntegration(client, {
              service: "line",
              status: "success",
              payload: { kind: "push" },
            });
          }
        }
      }
    } catch (err) {
      console.error("[notifyAndLog] line ล้มเหลว:", err);
      await logIntegration(client, {
        service: "line",
        status: "failed",
        payload: { kind: "push" },
        error_detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ── System config loading (master toggles + per-event override) ──
interface NotificationConfig {
  welpruEnabled: boolean;
  discordEnabled: boolean;
  lineEnabled: boolean;
  settings: Record<string, EventOverride>;
}

const CONFIG_DISABLED: NotificationConfig = {
  welpruEnabled: false,
  discordEnabled: false,
  lineEnabled: false,
  settings: {},
};

// ★ ต้องไม่ throw เด็ดขาด — ห่อ try/catch เพราะจุดเรียก (notifyAndLog) ไม่มี
//   try/catch รอบ config load และ query อาจ reject (ไม่ใช่แค่ resolve-with-error)
//   ถ้า config อ่านไม่ได้ไม่ว่าเหตุใด → ปิดทุกช่องทางใหม่ ปล่อย in-app ทำงานต่อ
async function loadNotificationConfig(client: SupabaseClient): Promise<NotificationConfig> {
  try {
    const { data, error } = await client
      .from("system_config")
      .select("welpru_enabled, discord_enabled, line_enabled, notification_settings")
      .single();
    if (error || !data) return CONFIG_DISABLED;
    const row = data as {
      welpru_enabled: boolean | null;
      discord_enabled: boolean | null;
      line_enabled: boolean | null;
      notification_settings: Record<string, EventOverride> | null;
    };
    return {
      welpruEnabled: row.welpru_enabled ?? false,
      discordEnabled: row.discord_enabled ?? false,
      lineEnabled: row.line_enabled ?? false,
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

// ── LINE eligibility + quota (ต้องไม่ throw — เรียกใน try/catch ของ LINE branch) ──
async function loadLineUserId(client: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("users")
      .select("line_user_id")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    return (data as { line_user_id: string | null }).line_user_id;
  } catch (err) {
    console.error("[notifyAndLog] loadLineUserId ล้มเหลว:", err);
    return null;
  }
}

function startOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// นับ push (ไม่นับ reply) เดือนนี้ — พังก็คืน 0 (favor delivery)
async function countLinePushesThisMonth(client: SupabaseClient): Promise<number> {
  try {
    const { count } = await client
      .from("integration_health")
      .select("*", { count: "exact", head: true })
      .eq("service", "line")
      .eq("status", "success")
      .eq("payload->>kind", "push")
      .gte("created_at", startOfMonthISO());
    return count ?? 0;
  } catch (err) {
    console.error("[notifyAndLog] countLinePushesThisMonth ล้มเหลว:", err);
    return 0;
  }
}

// ยิง line_quota_warning เดือนละครั้ง (dedupe) ให้ Admin — in-app + Discord เท่านั้น
// ★ ต้องไม่ throw เด็ดขาด — ห่อ try/catch เอง ไม่พึ่ง try/catch ของ LINE branch ที่เรียกฟังก์ชันนี้
//   (ไม่งั้น error ตรงนี้จะถูกบันทึกผิดเป็น service:'line', payload:{kind:'push'})
async function maybeFireQuotaWarning(client: SupabaseClient, sent: number): Promise<void> {
  try {
    const { count } = await client
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("event_key", "line_quota_warning")
      .gte("created_at", startOfMonthISO());
    if ((count ?? 0) > 0) return;

    const { data: cfg } = await client.from("system_config").select("admin_id").single();
    const adminId = (cfg as { admin_id: string | null } | null)?.admin_id;
    if (!adminId) return;

    // recursion ลึก 1 — event นี้ไม่มี lineApproval จึงไม่เข้า LINE branch อีก
    await notifyAndLog(client, {
      eventKey: "line_quota_warning",
      recipients: [{ userId: adminId }],
      variables: { sent: String(sent) },
    });
  } catch (err) {
    console.error("[notifyAndLog] maybeFireQuotaWarning ล้มเหลว:", err);
  }
}
