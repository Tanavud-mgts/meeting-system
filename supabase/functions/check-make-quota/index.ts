import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { runQuotaCheck } from "../_shared/makeQuota.ts";

// check-make-quota: trigger จาก Vercel Cron ผ่าน /api/keep-alive
// (Bearer = SUPABASE_SERVICE_ROLE_KEY) — runQuotaCheck ไม่ throw เด็ดขาด
Deno.serve(
  withErrorHandling(async (_req: Request) => {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await runQuotaCheck(adminClient);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
