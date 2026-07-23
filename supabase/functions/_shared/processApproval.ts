import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "./errors.ts";
import { syncCalendarCreate } from "./makeComClient.ts";

export type ApprovalAction = "approved" | "rejected";

export interface ProcessApprovalParams {
  bookingId: string;
  step: number;
  approverId: string;
  action: ApprovalAction;
  note?: string;
}

export interface ApprovalResult {
  bookingId: string;
  step: number;
  action: ApprovalAction;
  currentStep: number;
  finalStatus: string;
}

export async function processApproval(
  client: SupabaseClient,
  params: ProcessApprovalParams
): Promise<ApprovalResult> {
  const { bookingId, step, approverId, action, note } = params;

  if (action !== "approved" && action !== "rejected") {
    throw new ValidationError("การกระทำไม่ถูกต้อง");
  }

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("final_status, current_step")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    throw new NotFoundError("ไม่พบคำขอนี้");
  }

  if (booking.final_status !== "pending") {
    throw new ConflictError("คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว");
  }

  if (booking.current_step !== step - 1) {
    throw new ForbiddenError("ไม่ใช่คิวของท่านในขณะนี้");
  }

  const { error: insertError } = await client.from("approval_logs").insert({
    booking_id: bookingId,
    approver_id: approverId,
    step,
    action,
    note: note ?? null,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      throw new ConflictError("มีการดำเนินการนี้ไปแล้ว");
    }
    throw insertError;
  }

  let currentStep = booking.current_step as number;
  let finalStatus = booking.final_status as string;

  if (action === "rejected") {
    finalStatus = "rejected";
    const { error: updateError } = await client
      .from("bookings")
      .update({ final_status: finalStatus })
      .eq("id", bookingId);
    if (updateError) throw updateError;
  } else if (step < 3) {
    currentStep = step;
    const { error: updateError } = await client
      .from("bookings")
      .update({ current_step: currentStep })
      .eq("id", bookingId);
    if (updateError) throw updateError;
  } else {
    currentStep = 3;
    finalStatus = "approved";
    const { error: updateError } = await client
      .from("bookings")
      .update({ current_step: currentStep, final_status: finalStatus })
      .eq("id", bookingId);
    if (updateError) throw updateError;

    await syncCalendarCreate(client, bookingId);
  }

  return { bookingId, step, action, currentStep, finalStatus };
}
