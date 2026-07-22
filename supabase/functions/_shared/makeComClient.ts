import { RetryableHttpError, withRetry } from "./retry.ts";
import { logIntegration } from "./integrationLog.ts";
import { notifyCalendarSyncFailed } from "./bookingNotify.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

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

// ── Transport (fetch + Deno.env — ทดสอบตอน live ไม่ unit-test) ──
export type SendFn = (
  payload: CreatePayload | DeletePayload
) => Promise<Record<string, unknown> | null>;

// อ่านผ่าน globalThis.Deno เพื่อไม่ throw ใน Node/test env (Deno undefined → false)
export function isMakeConfigured(): boolean {
  try {
    const deno = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
    return Boolean(deno?.env.get("MAKE_WEBHOOK_URL"));
  } catch {
    return false;
  }
}

async function postToMake(
  url: string,
  secret: string,
  payload: CreatePayload | DeletePayload
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
    body: JSON.stringify(payload),
  });
  const outcome = classifyMakeResponse(res.status);
  if (outcome !== "ok") throw outcome;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ยิงจริงพร้อม retry — คืน null ถ้ายังไม่ตั้งค่า MAKE_WEBHOOK_URL (สวิตช์เปิดใช้งาน)
export const callMakeOrSkip: SendFn = async (payload) => {
  if (!isMakeConfigured()) return null;
  const env = (globalThis as { Deno: { env: { get(k: string): string | undefined } } }).Deno.env;
  const url = env.get("MAKE_WEBHOOK_URL")!;
  const secret = env.get("MAKE_WEBHOOK_SECRET") ?? "";
  return await withRetry(() => postToMake(url, secret, payload), { maxAttempts: 3 });
};

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" ? m : String(e);
}

async function onCalendarFailure(
  client: SupabaseClient,
  bookingId: string,
  action: "create" | "delete",
  detail: string
): Promise<void> {
  await logIntegration(client, {
    service: "make_com",
    status: "failed",
    payload: { action, booking_id: bookingId },
    error_detail: detail,
  });
  await notifyCalendarSyncFailed(client, bookingId, action);
}

// ── Orchestrators — ไม่ throw เด็ดขาด ──
export async function syncCalendarCreate(
  client: SupabaseClient,
  bookingId: string,
  send: SendFn = callMakeOrSkip
): Promise<void> {
  try {
    const { data, error } = await client
      .from("booking_detail")
      .select("id, ref_id, title, activity, attendees, room_name, requester_name, start_time, end_time")
      .eq("id", bookingId)
      .single();
    if (error || !data) return;

    let body: Record<string, unknown> | null;
    try {
      body = await send(buildCreatePayload(data as CreateRow));
    } catch (err) {
      await onCalendarFailure(client, bookingId, "create", errMsg(err));
      return;
    }
    if (body === null) return; // ยังไม่ตั้งค่า Make → ข้ามเงียบ

    const eventId = body.gcal_event_id;
    if (typeof eventId !== "string" || eventId.length === 0) {
      await onCalendarFailure(client, bookingId, "create", "Make response missing gcal_event_id");
      return;
    }

    const { error: updErr } = await client
      .from("bookings")
      .update({ gcal_event_id: eventId })
      .eq("id", bookingId);
    if (updErr) {
      await onCalendarFailure(
        client,
        bookingId,
        "create",
        `booking update failed (orphan event ${eventId}): ${errMsg(updErr)}`
      );
      return;
    }

    await logIntegration(client, {
      service: "make_com",
      status: "success",
      payload: { action: "create", booking_id: bookingId },
    });
  } catch (err) {
    console.error("[syncCalendarCreate]", err);
  }
}

export async function syncCalendarDelete(
  client: SupabaseClient,
  bookingId: string,
  send: SendFn = callMakeOrSkip
): Promise<void> {
  try {
    const { data, error } = await client
      .from("booking_detail")
      .select("id, ref_id, gcal_event_id")
      .eq("id", bookingId)
      .single();
    if (error || !data) return;
    const row = data as DeleteRow;
    if (!row.gcal_event_id) return; // ไม่มี event → ไม่ต้องลบ ไม่เรียก external

    let body: Record<string, unknown> | null;
    try {
      body = await send(buildDeletePayload(row));
    } catch (err) {
      await onCalendarFailure(client, bookingId, "delete", errMsg(err));
      return;
    }
    if (body === null) return;

    await logIntegration(client, {
      service: "make_com",
      status: "success",
      payload: { action: "delete", booking_id: bookingId },
    });
  } catch (err) {
    console.error("[syncCalendarDelete]", err);
  }
}
