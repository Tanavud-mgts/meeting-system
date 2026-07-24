import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { sendHousekeepingDigest } from "../_shared/housekeepingNotify.ts";

// send-housekeeping-digest: เรียกจาก pg_cron รายชั่วโมง (Bearer = SERVICE_ROLE_KEY)
// ตัวฟังก์ชันเช็คเวลา (Asia/Bangkok) + guard กันส่งซ้ำเอง — sendHousekeepingDigest ไม่ throw
Deno.serve(
  withErrorHandling(async (_req: Request) => {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await sendHousekeepingDigest(adminClient);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
