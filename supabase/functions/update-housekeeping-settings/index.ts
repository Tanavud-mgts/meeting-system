import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../_shared/errors.ts";

interface Body {
  housekeeping_enabled: boolean;
  housekeeping_line_group_id: string | null;
  housekeeping_digest_hour: number;
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
    if (!user) throw new UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");

    // ตรวจสิทธิ์ admin ก่อนแตะ body (mirror update-notification-settings)
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
      throw new ForbiddenError("ท่านไม่มีสิทธิ์แก้ไขการตั้งค่านี้");
    }

    const body: Body = await req.json();

    if (typeof body.housekeeping_enabled !== "boolean") {
      throw new ValidationError("ค่าเปิด/ปิดไม่ถูกต้อง");
    }
    if (
      !Number.isInteger(body.housekeeping_digest_hour) ||
      body.housekeeping_digest_hour < 0 ||
      body.housekeeping_digest_hour > 23
    ) {
      throw new ValidationError("ชั่วโมงส่งต้องอยู่ระหว่าง 0–23");
    }
    const groupId =
      body.housekeeping_line_group_id && body.housekeeping_line_group_id.trim()
        ? body.housekeeping_line_group_id.trim()
        : null;
    if (body.housekeeping_enabled && !groupId) {
      throw new ValidationError("กรุณากรอก LINE Group ID ก่อนเปิดใช้งาน");
    }

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("id")
      .single();
    if (configError || !config) throw new ValidationError("ไม่พบข้อมูลการตั้งค่าระบบ");

    const { data: updated, error: updateError } = await adminClient
      .from("system_config")
      .update({
        housekeeping_enabled: body.housekeeping_enabled,
        housekeeping_line_group_id: groupId,
        housekeeping_digest_hour: body.housekeeping_digest_hour,
      })
      .eq("id", config.id)
      .select("housekeeping_enabled, housekeeping_line_group_id, housekeeping_digest_hour")
      .single();
    if (updateError) throw updateError;

    await adminClient.from("activity_logs").insert({
      actor_id: user.id,
      action: "update_housekeeping_settings",
      target_type: "system_config",
      target_id: config.id,
    });

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
