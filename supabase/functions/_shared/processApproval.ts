import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { NotFoundError, ConflictError, ForbiddenError } from "./errors.ts";

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

    triggerCalendarSync(bookingId);
  }

  return { bookingId, step, action, currentStep, finalStatus };
}

// Extension point: เมื่อ Make.com webhook พร้อมใช้งาน (มี MAKE_WEBHOOK_URL
// secret ตั้งไว้แล้ว) ให้เรียก withRetry() + logIntegration() ที่นี่เพื่อสร้าง
// Google Calendar event — ยังไม่เรียกจริงในตอนนี้ตามที่ตกลงกันไว้
function triggerCalendarSync(_bookingId: string): void {
  // TODO (future track): เรียก Make.com webhook จริง
}
