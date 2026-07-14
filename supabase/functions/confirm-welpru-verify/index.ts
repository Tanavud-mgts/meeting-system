import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ValidationError } from "../_shared/errors.ts";
import { confirmWelpruVerify } from "../_shared/welpruVerify.ts";

interface ConfirmWelpruVerifyBody {
  token: string;
}

// verify_jwt=false: ยืนยันด้วย token อย่างเดียว (magic-link) — token ถูกส่งไป
// เฉพาะแอป WeLPRU ของเจ้าของบัญชี จึงเป็นหลักฐานตัวตนในตัว ไม่ต้องมี session
// login (ลิงก์กดจาก in-app browser ของ WeLPRU ที่ไม่ได้ login เว็บได้) token
// เป็น CSPRNG 24 ไบต์ ใช้ครั้งเดียว หมดอายุ 10 นาที (กัน brute-force/replay)
Deno.serve(
  withErrorHandling(async (req: Request) => {
    const body: ConfirmWelpruVerifyBody = await req.json();
    if (!body.token || body.token.trim().length === 0) {
      throw new ValidationError("ไม่พบ token ยืนยัน");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await confirmWelpruVerify(adminClient, { token: body.token });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
