import { RetryableHttpError } from "./retry.ts";

export interface CreateRow {
  id: string;
  ref_id: string;
  title: string;
  activity: string | null;
  attendees: number | null;
  room_name: string;
  requester_name: string;
  start_time: string;
  end_time: string;
}

export interface DeleteRow {
  id: string;
  ref_id: string;
  gcal_event_id: string | null;
}

export interface CreatePayload {
  action: "create";
  booking_id: string;
  ref_id: string;
  title: string;
  activity: string;
  attendees: number;
  room_name: string;
  requester_name: string;
  start_time: string;
  end_time: string;
}

export interface DeletePayload {
  action: "delete";
  booking_id: string;
  ref_id: string;
  gcal_event_id: string;
}

// ── Pure builders — ส่งเฉพาะฟิลด์ที่ใช้แสดง (ไม่มี requester_email) ──
export function buildCreatePayload(row: CreateRow): CreatePayload {
  return {
    action: "create",
    booking_id: row.id,
    ref_id: row.ref_id,
    title: row.title,
    activity: row.activity ?? "",
    attendees: row.attendees ?? 0,
    room_name: row.room_name,
    requester_name: row.requester_name,
    start_time: row.start_time,
    end_time: row.end_time,
  };
}

export function buildDeletePayload(row: DeleteRow): DeletePayload {
  return {
    action: "delete",
    booking_id: row.id,
    ref_id: row.ref_id,
    gcal_event_id: row.gcal_event_id ?? "",
  };
}

// ── Pure classifier — retry เฉพาะ 429/5xx (network error retry เองใน withRetry) ──
export function classifyMakeResponse(status: number): "ok" | Error {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429 || status >= 500) {
    return new RetryableHttpError(`Make webhook retryable: ${status}`);
  }
  return new Error(`Make webhook failed: ${status}`);
}
