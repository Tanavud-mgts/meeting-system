import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

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

export function buildNotification(
  eventKey: EventKey,
  vars: Record<string, string>
): { title: string; body: string; link: string } {
  const def = EVENT_DEFAULTS[eventKey];
  return {
    title: applyTemplate(def.title, vars),
    body: applyTemplate(def.body, vars),
    link: def.link,
  };
}

// notifyAndLog + NotifyParams เติมใน Task 3 (append ต่อท้ายไฟล์นี้)
