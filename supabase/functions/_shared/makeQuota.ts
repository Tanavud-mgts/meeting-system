// ── Pure logic สำหรับ Make.com quota alert — ไม่แตะ network/env ──

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { notifyAndLog } from "./notify.ts";
import { logIntegration } from "./integrationLog.ts";

export interface UsageRow {
  date: string;
  operations: number;
}

// นับ operations เฉพาะวันในรอบบิลปัจจุบัน — เทียบ date-only แบบ inclusive
// (วัน reset นับรวม → overcount เล็กน้อย = เตือนไวขึ้น เหมาะกับระบบเตือน)
export function sumUsageSinceReset(rows: UsageRow[], lastResetIso: string): number {
  const resetDate = lastResetIso.slice(0, 10); // ISO date เทียบ lexicographic ได้
  return rows.reduce((acc, r) => {
    if (typeof r.operations !== "number" || !Number.isFinite(r.operations)) return acc;
    return r.date.slice(0, 10) >= resetDate ? acc + r.operations : acc;
  }, 0);
}

// license เป็น object รูปร่างไม่ fix จาก Make API — อ่าน operations ถ้าเป็นเลขบวก
// ไม่งั้น fallback 1000 (Free Plan ตาม CLAUDE.md)
export function resolveLimit(license: unknown): number {
  const ops = (license as { operations?: unknown } | null | undefined)?.operations;
  return typeof ops === "number" && Number.isFinite(ops) && ops > 0 ? ops : 1000;
}

export function tierFor(used: number, limit: number): 0 | 80 | 95 {
  if (limit <= 0) return 0;
  const percent = (used / limit) * 100;
  if (percent >= 95) return 95;
  if (percent >= 80) return 80;
  return 0;
}

export type QuotaAction = "notify" | "reset" | "none";

export function decideAction(lastTier: number, currentTier: number): QuotaAction {
  if (currentTier > lastTier) return "notify";
  if (currentTier < lastTier) return "reset";
  return "none";
}

// ── Transport (fetch + Deno.env — ทดสอบตอน live ไม่ unit-test) ──

export interface QuotaSnapshot {
  used: number;
  limit: number;
}

export type FetchQuotaFn = () => Promise<QuotaSnapshot | null>;

const MAKE_API_BASE = "https://us2.make.com/api/v2";

function makeApiEnv(): { token: string; orgId: string } | null {
  try {
    const deno = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
    const token = deno?.env.get("MAKE_API_TOKEN");
    const orgId = deno?.env.get("MAKE_ORG_ID");
    if (!token || !orgId) return null;
    return { token, orgId };
  } catch {
    return null;
  }
}

async function makeApiGet(path: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${MAKE_API_BASE}${path}`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Make API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// คืน null เมื่อยังไม่ตั้ง MAKE_API_TOKEN/MAKE_ORG_ID (สวิตช์เปิดใช้งาน)
export const fetchMakeQuota: FetchQuotaFn = async () => {
  const env = makeApiEnv();
  if (!env) return null;

  const orgJson = await makeApiGet(`/organizations/${env.orgId}`, env.token);
  // บาง endpoint ของ Make ห่อ object ใน key ชื่อ resource — รองรับทั้งสองแบบ
  const org = (orgJson.organization ?? orgJson) as { lastReset?: unknown; license?: unknown };
  const lastReset = typeof org.lastReset === "string" ? org.lastReset : "";
  if (!lastReset) throw new Error("Make API: organization.lastReset missing");

  const usageJson = await makeApiGet(`/organizations/${env.orgId}/usage`, env.token);
  const rowsRaw = Array.isArray(usageJson) ? usageJson : (usageJson.usage ?? []);
  if (!Array.isArray(rowsRaw)) throw new Error("Make API: usage rows missing");

  return {
    used: sumUsageSinceReset(rowsRaw as UsageRow[], lastReset),
    limit: resolveLimit(org.license),
  };
};

// ── Orchestrator — ไม่ throw เด็ดขาด (เรียกจาก check-make-quota) ──
export async function runQuotaCheck(
  client: SupabaseClient,
  fetchQuota: FetchQuotaFn = fetchMakeQuota
): Promise<void> {
  try {
    let snap: QuotaSnapshot | null;
    try {
      snap = await fetchQuota();
    } catch (err) {
      await logIntegration(client, {
        service: "make_com",
        status: "failed",
        payload: { kind: "quota_check" },
        error_detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (snap === null) return; // ยังไม่ตั้ง secrets → เงียบสนิท

    const { used, limit } = snap;
    const currentTier = tierFor(used, limit);

    const { data, error } = await client
      .from("system_config")
      .select("id, admin_id, make_quota_last_tier")
      .single();
    if (error || !data) {
      await logIntegration(client, {
        service: "make_com",
        status: "failed",
        payload: { kind: "quota_check", used, limit },
        error_detail: `system_config read failed: ${error?.message ?? "no row"}`,
      });
      return;
    }
    const cfg = data as { id: string; admin_id: string | null; make_quota_last_tier: number | null };
    const action = decideAction(cfg.make_quota_last_tier ?? 0, currentTier);

    if (action !== "none") {
      // state-first: UPDATE ต้องสำเร็จก่อนแจ้ง — พังแล้วแจ้งไป จะ spam ซ้ำทุกรอบ cron
      const { error: updErr } = await client
        .from("system_config")
        .update({ make_quota_last_tier: currentTier })
        .eq("id", cfg.id);
      if (updErr) {
        await logIntegration(client, {
          service: "make_com",
          status: "failed",
          payload: { kind: "quota_check", used, limit },
          error_detail: `state update failed: ${updErr.message}`,
        });
        return;
      }

      if (action === "notify" && cfg.admin_id) {
        await notifyAndLog(client, {
          eventKey: "make_quota_warning",
          recipients: [{ userId: cfg.admin_id }],
          variables: {
            used: String(used),
            limit: String(limit),
            percent: String(Math.round((used / limit) * 100)),
          },
        });
      }
    }

    await logIntegration(client, {
      service: "make_com",
      status: "success",
      payload: { kind: "quota_check", used, limit },
    });
  } catch (err) {
    console.error("[runQuotaCheck]", err);
  }
}
