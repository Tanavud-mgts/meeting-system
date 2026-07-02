import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError } from "../_shared/errors.ts";
import {
  processApproval,
  type ApprovalAction,
} from "../_shared/processApproval.ts";

interface ApproveBookingRequest {
  booking_id: string;
  action: ApprovalAction;
  note?: string;
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

    const body: ApproveBookingRequest = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("admin_id, approver1_id, approver2_id")
      .single();

    if (configError || !config) {
      throw new ForbiddenError("ไม่พบข้อมูล Approval Chain");
    }

    let step: number;
    if (config.admin_id === user.id) {
      step = 1;
    } else if (config.approver1_id === user.id) {
      step = 2;
    } else if (config.approver2_id === user.id) {
      step = 3;
    } else {
      throw new ForbiddenError("ท่านไม่ได้อยู่ใน Approval Chain");
    }

    const result = await processApproval(adminClient, {
      bookingId: body.booking_id,
      step,
      approverId: user.id,
      action: body.action,
      note: body.note,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
