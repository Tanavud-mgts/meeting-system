// ⚠️ SYNC: defaultTitle/defaultBody ต้องตรงกับ EVENT_DEFAULTS ใน
// supabase/functions/_shared/notify.ts (source of truth). frontend เก็บสำเนา
// เพราะข้าม runtime Deno↔Node ไม่ได้. ถ้าแก้ default ใน notify.ts ต้องแก้ที่นี่ด้วย.

export type Channel = "discord" | "welpru" | "line";

export interface EventMeta {
  key: string;
  label: string;
  channels: Channel[];
  defaultTitle: string;
  defaultBody: string;
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  discord: "Discord",
  welpru: "WeLPRU",
  line: "LINE",
};

export const EVENT_META: EventMeta[] = [
  {
    key: "booking_submitted",
    label: "คำขอจองใหม่ (แจ้งผู้อนุมัติขั้นที่ 1)",
    channels: ["discord", "welpru", "line"],
    defaultTitle: "🔔 มีคำขอจองห้องประชุมใหม่",
    defaultBody: "{booker} ขอจอง{room} วันที่ {date} เวลา {time} โปรดพิจารณาอนุมัติ",
  },
  {
    key: "booking_step_approved",
    label: "ผ่านการอนุมัติขั้น (แจ้งผู้อนุมัติถัดไป)",
    channels: ["discord", "welpru", "line"],
    defaultTitle: "🔔 มีคำขอจองรอท่านพิจารณา",
    defaultBody: "{booker} ขอจอง{room} วันที่ {date} เวลา {time} ผ่านการอนุมัติขั้นก่อนหน้าแล้ว",
  },
  {
    key: "booking_approved",
    label: "อนุมัติครบทุกขั้น (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "✅ การจองได้รับอนุมัติแล้ว",
    defaultBody: "การจอง{room} วันที่ {date} เวลา {time} ได้รับอนุมัติเรียบร้อยแล้ว",
  },
  {
    key: "booking_rejected",
    label: "ถูกปฏิเสธ (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "❌ การจองไม่ได้รับอนุมัติ",
    defaultBody: "การจอง{room} วันที่ {date} ไม่ได้รับอนุมัติ เหตุผล: {reason}",
  },
  {
    key: "cancellation_requested",
    label: "ขอยกเลิกการจอง (แจ้ง Admin)",
    channels: ["discord", "welpru"],
    defaultTitle: "🔔 มีคำขอยกเลิกการจอง",
    defaultBody: "{booker} ขอยกเลิกการจอง{room} วันที่ {date} เหตุผล: {reason}",
  },
  {
    key: "cancellation_approved",
    label: "อนุมัติคำขอยกเลิก (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "✅ คำขอยกเลิกได้รับอนุมัติ",
    defaultBody: "การจอง{room} วันที่ {date} ถูกยกเลิกเรียบร้อยแล้ว",
  },
  {
    key: "cancellation_denied",
    label: "ไม่อนุมัติคำขอยกเลิก (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "❌ คำขอยกเลิกไม่ได้รับอนุมัติ",
    defaultBody: "การจอง{room} วันที่ {date} ยังมีผลตามเดิม เหตุผล: {reason}",
  },
  {
    key: "booking_cancelled",
    label: "ถูกยกเลิกโดยผู้ดูแล (แจ้งผู้จอง)",
    channels: ["discord", "welpru"],
    defaultTitle: "⚠️ การจองของท่านถูกยกเลิก",
    defaultBody: "การจอง{room} วันที่ {date} เวลา {time} ถูกยกเลิก เหตุผล: {reason}",
  },
  {
    key: "line_quota_warning",
    label: "เตือนโควตา LINE ใกล้เต็ม (แจ้ง Admin)",
    channels: ["discord"],
    defaultTitle: "⚠️ โควตา LINE ใกล้เต็ม",
    defaultBody: "เดือนนี้ส่งไปแล้ว {sent}/500 ข้อความ เมื่อครบโควตาระบบจะหยุดส่งทาง LINE อัตโนมัติ",
  },
];

// ตัวแปรตัวอย่างสำหรับ preview — ต้องครอบคลุมทุก {var} ที่ default body ใช้
export const PREVIEW_VARS: Record<string, string> = {
  booker: "สมชาย ใจดี",
  room: "ห้องประชุม 1",
  date: "15 ก.ค. 69",
  time: "09:00–12:00 น.",
  reason: "ตัวอย่างเหตุผล",
  sent: "410",
  step: "1",
  approver: "ผู้อนุมัติ 2",
};

export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}
