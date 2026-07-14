import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError } from "../_shared/errors.ts";
import {
  decideCancellation,
  type CancellationDecision,
} from "../_shared/processCancellation.ts";
import { notifyCancellationDecision } from "../_shared/bookingNotify.ts";

interface DecideCancellationBody {
  booking_id: string;
  decision: CancellationDecision;
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

    const body: DecideCancellationBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new ForbiddenError("ไม่พบข้อมูลผู้ใช้งาน");
    }

    if (profile.role !== "admin" && profile.role !== "approver") {
      throw new ForbiddenError("ท่านไม่มีสิทธิ์พิจารณาคำขอยกเลิก");
    }

    const result = await decideCancellation(adminClient, {
      bookingId: body.booking_id,
      deciderId: user.id,
      role: profile.role,
      decision: body.decision,
    });

    await notifyCancellationDecision(adminClient, body.booking_id, body.decision);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
