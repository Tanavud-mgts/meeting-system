import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Keep-alive endpoint pinged by Vercel Cron (see vercel.json) so the Supabase
// Free-Plan project does not auto-pause after 7 days of inactivity. Vercel Cron
// sends `Authorization: Bearer ${CRON_SECRET}` automatically when CRON_SECRET is
// configured; we reject anything else so the endpoint is not publicly callable.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "ไม่ได้รับอนุญาต" },
      { status: 401 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Trivial HEAD read registers activity (the actual keep-alive) without
  // depending on any specific column.
  const { error } = await supabase
    .from("system_config")
    .select("*", { count: "exact", head: true });

  const status = error ? "failed" : "success";

  // Best-effort heartbeat row so /dashboard/integrations shows a life signal.
  // Not fatal if it fails — the ping above already did the keep-alive job.
  await supabase.from("integration_health").insert({
    service: "internal",
    status,
    payload: { source: "keep-alive-cron", at: new Date().toISOString() },
    error_detail: error?.message ?? null,
  });

  // Trigger Make quota check (Edge Function) — await แบบ non-fatal:
  // serverless ฆ่า floating promise หลัง return จึง await แต่ห่อ try/catch
  // ไม่ให้กระทบผล keep-alive (จุดประสงค์หลักของ endpoint นี้)
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/check-make-quota`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
  } catch (quotaErr) {
    console.error("[keep-alive] check-make-quota trigger failed:", quotaErr);
  }

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
