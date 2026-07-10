import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { UnauthorizedError } from "../_shared/errors.ts";
import { requestWelpruVerify } from "../_shared/welpruVerify.ts";

interface RequestWelpruVerifyBody {
  staff_id: string;
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

    const body: RequestWelpruVerifyBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const siteUrl = Deno.env.get("SITE_URL")!;

    const result = await requestWelpruVerify(adminClient, {
      userId: user.id,
      staffId: body.staff_id,
      siteUrl,
    });

    return new Response(JSON.stringify({ success: true, tokenPreview: result.token.slice(0, 8) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
