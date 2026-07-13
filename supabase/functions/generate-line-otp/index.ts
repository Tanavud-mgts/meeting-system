import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { UnauthorizedError, AppError } from "../_shared/errors.ts";

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // สร้าง OTP — otp เป็น UNIQUE, ชนก็ลองใหม่สูงสุด 5 ครั้ง
    let otp = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      otp = generateOtp();
      const { error } = await adminClient
        .from("line_link_tokens")
        .insert({ user_id: user.id, otp });
      if (!error) {
        return new Response(JSON.stringify({ otp, expiresInMinutes: 10 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if ((error as { code?: string }).code !== "23505") throw error;
    }
    throw new AppError("OTP_GENERATION_FAILED", "ไม่สามารถสร้างรหัสได้ กรุณาลองใหม่", 500);
  })
);
