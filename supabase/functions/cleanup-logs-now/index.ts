import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError } from "../_shared/errors.ts";

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

    const { error: rpcError } = await adminClient.rpc("cleanup_old_logs");

    if (rpcError) throw rpcError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
