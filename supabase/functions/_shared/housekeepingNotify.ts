import { formatThaiDate, formatThaiTimeRange } from "./notify.ts";

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
