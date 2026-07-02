import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from "./errors.ts";

export type CancellationRole = "admin" | "approver";
export type CancellationDecision = "approve" | "reject";

export interface RequestCancellationParams {
  bookingId: string;
  requesterId: string;
  reason: string;
}

export interface RequestCancellationResult {
  bookingId: string;
  newStatus: "cancelled" | "cancel_requested";
}

export async function requestCancellation(
  client: SupabaseClient,
  params: RequestCancellationParams
): Promise<RequestCancellationResult> {
  const { bookingId, requesterId, reason } = params;

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError("กรุณากรอกเหตุผลการยกเลิก");
  }

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("final_status, requester_id")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    throw new NotFoundError("ไม่พบรายการจองนี้");
  }

  if (booking.requester_id !== requesterId) {
    throw new ForbiddenError("ท่านไม่มีสิทธิ์ยกเลิกรายการนี้");
  }

  if (booking.final_status === "pending") {
    const { data: updated, error: updateError } = await client
      .from("bookings")
      .update({ final_status: "cancelled" })
      .eq("id", bookingId)
      .eq("final_status", "pending")
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new ConflictError(
        "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า"
      );
    }

    const { error: insertError } = await client
      .from("cancellation_logs")
      .insert({
        booking_id: bookingId,
        cancelled_by: requesterId,
        role: "user",
        prev_status: "pending",
        reason,
      });

    if (insertError) throw insertError;

    return { bookingId, newStatus: "cancelled" };
  }

  if (booking.final_status === "approved") {
    const { data: updated, error: updateError } = await client
      .from("bookings")
      .update({ final_status: "cancel_requested", cancellation_reason: reason })
      .eq("id", bookingId)
      .eq("final_status", "approved")
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new ConflictError(
        "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า"
      );
    }

    return { bookingId, newStatus: "cancel_requested" };
  }

  throw new ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า");
}

export interface DecideCancellationParams {
  bookingId: string;
  deciderId: string;
  role: CancellationRole;
  decision: CancellationDecision;
}

export interface DecideCancellationResult {
  bookingId: string;
  newStatus: "cancelled" | "approved";
}

export async function decideCancellation(
  client: SupabaseClient,
  params: DecideCancellationParams
): Promise<DecideCancellationResult> {
  const { bookingId, deciderId, role, decision } = params;

  if (decision !== "approve" && decision !== "reject") {
    throw new ValidationError("การกระทำไม่ถูกต้อง");
  }

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("final_status, cancellation_reason")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    throw new NotFoundError("ไม่พบรายการจองนี้");
  }

  if (booking.final_status !== "cancel_requested") {
    throw new ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า");
  }

  if (decision === "approve") {
    const { data: updated, error: updateError } = await client
      .from("bookings")
      .update({ final_status: "cancelled" })
      .eq("id", bookingId)
      .eq("final_status", "cancel_requested")
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new ConflictError(
        "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า"
      );
    }

    const { error: insertError } = await client
      .from("cancellation_logs")
      .insert({
        booking_id: bookingId,
        cancelled_by: deciderId,
        role,
        prev_status: "cancel_requested",
        reason: booking.cancellation_reason,
      });

    if (insertError) throw insertError;

    triggerCalendarDelete(bookingId);

    return { bookingId, newStatus: "cancelled" };
  }

  const { data: updated, error: updateError } = await client
    .from("bookings")
    .update({ final_status: "approved" })
    .eq("id", bookingId)
    .eq("final_status", "cancel_requested")
    .select("id");

  if (updateError) throw updateError;
  if (!updated || updated.length === 0) {
    throw new ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า");
  }

  const { error: activityError } = await client.from("activity_logs").insert({
    actor_id: deciderId,
    action: "reject_cancel_request",
    target_type: "booking",
    target_id: bookingId,
    detail: { reason: booking.cancellation_reason },
  });

  if (activityError) throw activityError;

  return { bookingId, newStatus: "approved" };
}

// Extension point: เมื่อ Make.com webhook พร้อมใช้งาน (มี MAKE_WEBHOOK_URL
// secret ตั้งไว้แล้ว) ให้เรียก withRetry() + logIntegration() ที่นี่เพื่อลบ
// Google Calendar event ด้วย gcal_event_id — ยังไม่เรียกจริงในตอนนี้ตามที่
// ตกลงกันไว้ (ดู Global Constraints)
function triggerCalendarDelete(_bookingId: string): void {
  // TODO (future track): เรียก Make.com webhook จริง
}
