import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../_shared/errors.ts";

interface UpdateRetentionSettingsBody {
  activity_log_retention_months: number;
  integration_log_retention_months: number;
  line_token_retention_days: number;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
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

    const body: UpdateRetentionSettingsBody = await req.json();

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
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้");
    }

    if (
      !isPositiveInteger(body.activity_log_retention_months) ||
      !isPositiveInteger(body.integration_log_retention_months) ||
      !isPositiveInteger(body.line_token_retention_days)
    ) {
      throw new ValidationError("ค่าที่กรอกต้องเป็นจำนวนเต็มบวก");
    }

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("id")
      .single();

    if (configError || !config) {
      throw new ValidationError("ไม่พบข้อมูลการตั้งค่าระบบ");
    }

    const { data: updated, error: updateError } = await adminClient
      .from("system_config")
      .update({
        activity_log_retention_months: body.activity_log_retention_months,
        integration_log_retention_months:
          body.integration_log_retention_months,
        line_token_retention_days: body.line_token_retention_days,
      })
      .eq("id", config.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
