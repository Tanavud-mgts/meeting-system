import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError, ValidationError } from "../_shared/errors.ts";
import { validateNotificationSettings } from "../_shared/notificationSettings.ts";

interface Body {
  welpru_enabled: boolean;
  discord_enabled: boolean;
  line_enabled: boolean;
  notification_settings: unknown;
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

    const body: Body = await req.json();

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

    if (
      typeof body.welpru_enabled !== "boolean" ||
      typeof body.discord_enabled !== "boolean" ||
      typeof body.line_enabled !== "boolean"
    ) {
      throw new ValidationError("ค่าเปิ/ปิดช่องทางไม่ถูกต้อง");
    }

    const validated = validateNotificationSettings(body.notification_settings);
    if (!validated.ok) throw new ValidationError(validated.error);

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("id")
      .single();
    if (configError || !config) throw new ValidationError("ไม่พบข้อมูลการตั้งค่าระบบ");

    const { data: updated, error: updateError } = await adminClient
      .from("system_config")
      .update({
        welpru_enabled: body.welpru_enabled,
        discord_enabled: body.discord_enabled,
        line_enabled: body.line_enabled,
        notification_settings: validated.value,
      })
      .eq("id", config.id)
      .select("welpru_enabled, discord_enabled, line_enabled, notification_settings")
      .single();
    if (updateError) throw updateError;

    // audit log (ตาม spec — ใช้ activity_logs เดิม)
    await adminClient.from("activity_logs").insert({
      actor_id: user.id,
      action: "update_notification_settings",
      target_type: "system_config",
      target_id: config.id,
    });

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
