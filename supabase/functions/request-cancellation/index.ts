import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { UnauthorizedError } from "../_shared/errors.ts";
import { requestCancellation } from "../_shared/processCancellation.ts";
import { notifyCancellationRequested } from "../_shared/bookingNotify.ts";

interface RequestCancellationBody {
  booking_id: string;
  reason: string;
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

    const body: RequestCancellationBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const result = await requestCancellation(adminClient, {
      bookingId: body.booking_id,
      requesterId: user.id,
      reason: body.reason,
    });

    if (result.newStatus === "cancel_requested") {
      await notifyCancellationRequested(adminClient, body.booking_id, body.reason);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
