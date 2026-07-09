import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ValidationError, UnauthorizedError, ConflictError } from "../_shared/errors.ts";
import { notifyBookingSubmitted } from "../_shared/bookingNotify.ts";

interface CreateBookingRequest {
  room_id: string;
  title: string;
  activity: string;
  attendees: number;
  start_time: string;
  end_time: string;
}

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

    const body: CreateBookingRequest = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: room, error: roomError } = await adminClient
      .from("rooms")
      .select("capacity")
      .eq("id", body.room_id)
      .single();

    if (roomError || !room) {
      throw new ValidationError("ไม่พบห้องประชุมที่เลือก");
    }

    if (body.attendees > room.capacity) {
      throw new ValidationError("จำนวนผู้เข้าร่วมเกินความจุห้อง");
    }

    const { data: booking, error: insertError } = await adminClient
      .from("bookings")
      .insert({
        room_id: body.room_id,
        requester_id: user.id,
        title: body.title,
        activity: body.activity,
        attendees: body.attendees,
        start_time: body.start_time,
        end_time: body.end_time,
      })
      .select("id, ref_id")
      .single();

    if (insertError) {
      if (insertError.code === "23P01") {
        throw new ConflictError("ห้องถูกจองแล้วในช่วงเวลานี้ กรุณาเลือกเวลาอื่น");
      }
      if (insertError.code === "P0001") {
        throw new ValidationError(insertError.message);
      }
      throw insertError;
    }

    await notifyBookingSubmitted(adminClient, booking.id);

    return new Response(JSON.stringify(booking), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  })
);
