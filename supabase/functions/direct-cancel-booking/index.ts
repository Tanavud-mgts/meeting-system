import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../_shared/errors.ts";
import { notifyBookingCancelledByAdmin } from "../_shared/bookingNotify.ts";
import { syncCalendarDelete } from "../_shared/makeComClient.ts";

interface DirectCancelBookingBody {
  booking_id: string;
  reason: string;
}

const TERMINAL_STATUSES = ["cancelled", "cancelled_by_admin", "rejected"];

Deno.serve(
  withErrorHandling(async (req: Request) => {
    const authHeader = req.headers.get("Authorization") ?? "";

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
    }

    const body: DirectCancelBookingBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: caller, error: callerError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerError || !caller || caller.role !== "admin") {
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ยกเลิกรายการนี้");
    }

    if (!body.reason || body.reason.trim().length === 0) {
      throw new ValidationError("กรุณากรอกเหตุผลการยกเลิก");
    }

    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .select("final_status, gcal_event_id")
      .eq("id", body.booking_id)
      .single();

    if (bookingError || !booking) {
      throw new NotFoundError("ไม่พบรายการจองนี้");
    }

    if (TERMINAL_STATUSES.includes(booking.final_status)) {
      throw new ConflictError("รายการนี้ถูกยกเลิกไปแล้ว");
    }

    const prevStatus = booking.final_status;

    const { data: updated, error: updateError } = await adminClient
      .from("bookings")
      .update({ final_status: "cancelled_by_admin" })
      .eq("id", body.booking_id)
      .eq("final_status", prevStatus)
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new ConflictError(
        "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า"
      );
    }

    const { error: insertError } = await adminClient
      .from("cancellation_logs")
      .insert({
        booking_id: body.booking_id,
        cancelled_by: user.id,
        role: "admin",
        prev_status: prevStatus,
        reason: body.reason,
      });

    if (insertError) throw insertError;

    if (booking.gcal_event_id) {
      await syncCalendarDelete(adminClient, body.booking_id);
    }

    await notifyBookingCancelledByAdmin(adminClient, body.booking_id, body.reason);

    return new Response(
      JSON.stringify({
        bookingId: body.booking_id,
        newStatus: "cancelled_by_admin",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  })
);
