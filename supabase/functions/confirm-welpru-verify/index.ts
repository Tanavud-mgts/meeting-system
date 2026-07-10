import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { UnauthorizedError, ValidationError } from "../_shared/errors.ts";
import { confirmWelpruVerify } from "../_shared/welpruVerify.ts";

interface ConfirmWelpruVerifyBody {
  token: string;
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

    const body: ConfirmWelpruVerifyBody = await req.json();
    if (!body.token || body.token.trim().length === 0) {
      throw new ValidationError("ไม่พบ token ยืนยัน");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await confirmWelpruVerify(adminClient, { userId: user.id, token: body.token });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
