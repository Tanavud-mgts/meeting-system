import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatThaiDate, formatThaiTimeRange } from "./notify.ts";
import { countLinePushesThisMonth } from "./notify.ts";
import { logIntegration } from "./integrationLog.ts";
import { pushTextToGroup } from "./lineClient.ts";

const TZ = "Asia/Bangkok";

export interface HousekeepingRow {
  ref_id: string;
  room_name: string;
  title: string;
  activity: string;
  attendees: number;
  start_time: string;
  end_time: string;
  requester_name: string;
  requester_department: string | null;
  notes_for_staff: string | null;
}

// บวก/ลบวันบน date string "YYYY-MM-DD" โดยไม่ยุ่งเขตเวลา
export function addDaysISODate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function bangkokDateString(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso)); // en-CA → YYYY-MM-DD
}

export function bangkokHour(iso: string): number {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
  return Number(s);
}

export function isNearTerm(
  startIso: string,
  nowIso: string
): "today" | "tomorrow" | null {
  const startDate = bangkokDateString(startIso);
  const today = bangkokDateString(nowIso);
  if (startDate === today) return "today";
  if (startDate === addDaysISODate(today, 1)) return "tomorrow";
  return null;
}

const NEAR_LABEL: Record<"today" | "tomorrow", string> = {
  today: "วันนี้",
  tomorrow: "พรุ่งนี้",
};

function itemLines(r: HousekeepingRow): string {
  const dept = r.requester_department ? ` (${r.requester_department})` : "";
  const lines = [
    `🕐 ${formatThaiTimeRange(r.start_time, r.end_time)} | ${r.room_name}`,
    `${r.title} · ${r.attendees} คน`,
    `โดย: ${r.requester_name}${dept}`,
  ];
  if (r.notes_for_staff && r.notes_for_staff.trim()) {
    lines.push(`📝 ${r.notes_for_staff.trim()}`);
  }
  lines.push(`[${r.ref_id}]`);
  return lines.join("\n");
}

export function buildDigestMessage(
  rows: HousekeepingRow[],
  forDateIso: string
): string {
  const dateLabel = formatThaiDate(forDateIso);
  if (rows.length === 0) {
    return `📋 ห้องประชุมพรุ่งนี้ (${dateLabel})\nพรุ่งนี้ (${dateLabel}) ไม่มีการใช้ห้องประชุม`;
  }
  const header = `📋 ห้องประชุมพรุ่งนี้ (${dateLabel}) — ${rows.length} รายการ`;
  const items = rows.map((r, i) => {
    const dept = r.requester_department ? ` (${r.requester_department})` : "";
    const body = [
      `${i + 1}) ${formatThaiTimeRange(r.start_time, r.end_time)} | ${r.room_name}`,
      `   ${r.title} · ${r.attendees} คน`,
      `   โดย: ${r.requester_name}${dept}`,
    ];
    if (r.notes_for_staff && r.notes_for_staff.trim()) {
      body.push(`   📝 ${r.notes_for_staff.trim()}`);
    }
    body.push(`   [${r.ref_id}]`);
    return body.join("\n");
  });
  return `${header}\n\n${items.join("\n\n")}`;
}

export function buildApprovedMessage(
  r: HousekeepingRow,
  nearTerm: "today" | "tomorrow"
): string {
  return `✅ ยืนยันการประชุม (${NEAR_LABEL[nearTerm]})\n${itemLines(r)}`;
}

export function buildCancelledMessage(
  r: HousekeepingRow,
  nearTerm: "today" | "tomorrow"
): string {
  const head = `❌ ยกเลิกการประชุม (${NEAR_LABEL[nearTerm]})`;
  const lines = [
    `🕐 ${formatThaiTimeRange(r.start_time, r.end_time)} | ${r.room_name}`,
    r.title,
    `[${r.ref_id}]`,
    "ไม่ต้องเตรียมห้องนี้แล้ว",
  ];
  return `${head}\n${lines.join("\n")}`;
}

export interface DigestGateConfig {
  housekeeping_enabled: boolean;
  housekeeping_line_group_id: string | null;
  housekeeping_digest_hour: number;
  housekeeping_digest_last_sent_on: string | null;
}

export function shouldSendDigestNow(
  cfg: DigestGateConfig,
  nowIso: string
): boolean {
  if (!cfg.housekeeping_enabled) return false;
  if (!cfg.housekeeping_line_group_id) return false;
  if (bangkokHour(nowIso) !== cfg.housekeeping_digest_hour) return false;
  if (cfg.housekeeping_digest_last_sent_on === bangkokDateString(nowIso)) return false;
  return true;
}

const DETAIL_COLS =
  "id, ref_id, room_name, title, activity, attendees, start_time, end_time, requester_name, requester_department, notes_for_staff, current_step";

interface HousekeepingConfigRow extends DigestGateConfig {}

async function loadConfig(client: SupabaseClient): Promise<HousekeepingConfigRow | null> {
  try {
    const { data, error } = await client
      .from("system_config")
      .select(
        "housekeeping_enabled, housekeeping_line_group_id, housekeeping_digest_hour, housekeeping_digest_last_sent_on"
      )
      .single();
    if (error || !data) return null;
    return data as HousekeepingConfigRow;
  } catch (err) {
    console.error("[housekeeping] loadConfig", err);
    return null;
  }
}

async function loadDetail(
  client: SupabaseClient,
  bookingId: string
): Promise<(HousekeepingRow & { current_step: number }) | null> {
  try {
    const { data, error } = await client
      .from("booking_detail")
      .select(DETAIL_COLS)
      .eq("id", bookingId)
      .single();
    if (error || !data) return null;
    return data as HousekeepingRow & { current_step: number };
  } catch (err) {
    console.error("[housekeeping] loadDetail", err);
    return null;
  }
}

// ส่ง text เข้ากลุ่ม ถ้าเปิดใช้งาน + มี group id + quota ไม่เต็ม — log ทุกกรณี ไม่ throw
async function sendToHousekeepingGroup(
  client: SupabaseClient,
  cfg: HousekeepingConfigRow,
  text: string
): Promise<void> {
  if (!cfg.housekeeping_enabled || !cfg.housekeeping_line_group_id) return;
  try {
    const sent = await countLinePushesThisMonth(client);
    if (sent >= 500) {
      await logIntegration(client, {
        service: "internal",
        status: "success",
        payload: { skipped: "line_quota", sent, target: "housekeeping" },
      });
      return;
    }
    await pushTextToGroup(cfg.housekeeping_line_group_id, text);
    await logIntegration(client, {
      service: "line",
      status: "success",
      payload: { kind: "push", target: "housekeeping" },
    });
  } catch (err) {
    console.error("[housekeeping] sendToGroup", err);
    await logIntegration(client, {
      service: "line",
      status: "failed",
      payload: { kind: "push", target: "housekeeping" },
      error_detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyHousekeepingApproved(
  client: SupabaseClient,
  bookingId: string
): Promise<void> {
  try {
    const cfg = await loadConfig(client);
    if (!cfg || !cfg.housekeeping_enabled || !cfg.housekeeping_line_group_id) return;
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    const near = isNearTerm(d.start_time, new Date().toISOString());
    if (!near) return;
    await sendToHousekeepingGroup(client, cfg, buildApprovedMessage(d, near));
  } catch (err) {
    console.error("[notifyHousekeepingApproved]", err);
  }
}

export async function notifyHousekeepingCancelled(
  client: SupabaseClient,
  bookingId: string
): Promise<void> {
  try {
    const cfg = await loadConfig(client);
    if (!cfg || !cfg.housekeeping_enabled || !cfg.housekeeping_line_group_id) return;
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    // แจ้งยกเลิกเฉพาะ booking ที่เคยผ่าน chain ครบ (current_step === 3) — แม่บ้านเคยรับข้อมูลไปแล้ว
    if (d.current_step !== 3) return;
    const near = isNearTerm(d.start_time, new Date().toISOString());
    if (!near) return;
    await sendToHousekeepingGroup(client, cfg, buildCancelledMessage(d, near));
  } catch (err) {
    console.error("[notifyHousekeepingCancelled]", err);
  }
}

export async function sendHousekeepingDigest(client: SupabaseClient): Promise<void> {
  try {
    const cfg = await loadConfig(client);
    if (!cfg) return;
    const nowIso = new Date().toISOString();
    if (!shouldSendDigestNow(cfg, nowIso)) return;

    const tomorrow = addDaysISODate(bangkokDateString(nowIso), 1);
    const startBound = `${tomorrow}T00:00:00+07:00`;
    const endBound = `${addDaysISODate(tomorrow, 1)}T00:00:00+07:00`;

    const { data, error } = await client
      .from("booking_detail")
      .select(DETAIL_COLS)
      .eq("final_status", "approved")
      .gte("start_time", startBound)
      .lt("start_time", endBound)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("[housekeeping] digest query", error);
      return;
    }

    const rows = (data ?? []) as HousekeepingRow[];
    await sendToHousekeepingGroup(client, cfg, buildDigestMessage(rows, startBound));

    // guard กันส่งซ้ำวันนี้ (ทำหลังส่ง เพื่อ retry ได้ถ้าชั่วโมงยังไม่ผ่าน)
    await client
      .from("system_config")
      .update({ housekeeping_digest_last_sent_on: bangkokDateString(nowIso) })
      .eq("housekeeping_enabled", true);
  } catch (err) {
    console.error("[sendHousekeepingDigest]", err);
  }
}
