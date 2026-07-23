# Make.com Quota Alert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เตือน Admin เชิงรุก (in-app + Discord) เมื่อ Make.com ใช้ operations ถึง 80% และ 95% ของโควตา 1,000/รอบบิล โดยดึงตัวเลขจริงจาก Make API

**Architecture:** Edge Function ใหม่ `check-make-quota` (Deno) ถูก trigger จาก Vercel Cron `keep-alive` เดิม (ทุก 3 วัน) → เรียก Make API 2 ครั้ง (org detail เอา `lastReset`+`license`, usage เอารายวัน) → sum เฉพาะวันในรอบบิล → เทียบ tier (0/80/95) กับ state `system_config.make_quota_last_tier` → ข้ามขึ้น tier = อัปเดต state ก่อนแล้วแจ้ง admin ผ่าน notify registry (`make_quota_warning`) → log `integration_health` ทุกครั้ง

**Tech Stack:** Deno (Supabase Edge Functions), TypeScript, Vitest, `notifyAndLog()`/`logIntegration()`/`withErrorHandling()` เดิม, Vercel Cron เดิม

## Global Constraints

- **Rule 1:** Edge Function ใหม่ห่อด้วย `withErrorHandling()` จาก `_shared/handler.ts`
- **Rule 5:** ทุกการเรียก Make API ต้อง `logIntegration()` — service `make_com`, `payload.kind = "quota_check"` ทั้ง success/failed
- **Rule 7:** `MAKE_API_TOKEN` + `MAKE_ORG_ID` อยู่ใน **Supabase Edge Function Secrets** เท่านั้น
- **Rule 8:** migration เป็น additive เท่านั้น (`ADD COLUMN` ห้าม DROP)
- **State-first:** ต้อง `UPDATE make_quota_last_tier` สำเร็จก่อน แล้วค่อย `notifyAndLog` — UPDATE พัง = ห้ามแจ้ง (กัน spam ทุก 3 วัน)
- **Never-throw:** `runQuotaCheck` ห้าม throw ออก (pattern `syncCalendarCreate`)
- **Secrets ไม่ตั้ง → ข้ามเงียบ:** เหมือน `MAKE_WEBHOOK_URL` pattern (ไม่ log ไม่แจ้ง)
- **Make API พัง → log failed เท่านั้น ไม่แจ้ง admin**
- **Tier:** ≥95% → 95, ≥80% → 80, ไม่ถึง → 0. `limit = license.operations ?? 1000`, limit ≤ 0 → tier 0
- **รอบบิล:** เทียบ **date-only แบบ inclusive** — นับแถว usage ที่ `date >= lastReset.slice(0,10)` (วัน reset นับรวม overcount เล็กน้อย = เตือนไวขึ้น ยอมรับได้สำหรับระบบเตือน)
- **Deploy:** แก้ `notify.ts` (shared) → ต้อง redeploy ทุก function ที่ import: `approve-booking`, `decide-cancellation`, `direct-cancel-booking`, `request-cancellation`, `create-booking`, `line-webhook` + deploy `check-make-quota` ใหม่
- **Migration:** รันผ่าน `apply_migration` MCP (เซสชันที่มี) หรือ Supabase Dashboard SQL Editor — เซสชันนี้ไม่มี MCP; ไฟล์ต้องอยู่ใน `supabase/migrations/` เสมอ
- **UI text:** ภาษาไทยทางการ

---

## File Structure

- **Create:** `supabase/functions/_shared/makeQuota.ts` — pure logic (sum/limit/tier/decide) + transport (`fetchMakeQuota`) + orchestrator (`runQuotaCheck`)
- **Create:** `supabase/functions/_shared/makeQuota.test.ts`
- **Create:** `supabase/functions/check-make-quota/index.ts` — thin wrapper (withErrorHandling + service client + runQuotaCheck)
- **Create:** `supabase/migrations/024_make_quota_state.sql` — `ADD COLUMN make_quota_last_tier`
- **Modify:** `supabase/functions/_shared/notify.ts` — event `make_quota_warning` (4 จุด)
- **Modify:** `supabase/functions/_shared/notify.test.ts`
- **Modify:** `app/api/keep-alive/route.ts` — trigger check-make-quota (awaited-non-fatal)

---

## Task 1: Event `make_quota_warning` in notify registry

**Files:**
- Modify: `supabase/functions/_shared/notify.ts`
- Test: `supabase/functions/_shared/notify.test.ts`

**Interfaces:**
- Consumes: (none)
- Produces: `EventKey` เพิ่มค่า `"make_quota_warning"`; `buildNotification("make_quota_warning", { used, limit, percent })`; `buildDiscordMessage("make_quota_warning", vars)`

- [ ] **Step 1: Write the failing test**

เพิ่มท้าย `supabase/functions/_shared/notify.test.ts` (ไฟล์นี้ import `buildNotification`, `buildDiscordMessage` อยู่แล้ว):

```typescript
describe("make_quota_warning event (registry)", () => {
  const vars = { used: "820", limit: "1000", percent: "82" };

  it("buildNotification มี default title/body/link", () => {
    const n = buildNotification("make_quota_warning", vars);
    expect(n.title).toBe("⚠️ โควตา Make.com ใกล้เต็ม");
    expect(n.body).toBe(
      "เดือนนี้ใช้ไปแล้ว 820/1000 operations (82%) เมื่อครบโควตาการซิงก์ปฏิทินจะหยุดจนถึงรอบถัดไป"
    );
    expect(n.link).toBe("/dashboard/integrations");
  });

  it("Discord template แทนค่าครบ ไม่มี {..} ค้าง", () => {
    const msg = buildDiscordMessage("make_quota_warning", vars);
    expect(msg).toContain("820/1000");
    expect(msg).toContain("82%");
    expect(msg).not.toMatch(/\{[a-z_]+\}/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/notify.test.ts -t "make_quota_warning"`
Expected: FAIL — `"make_quota_warning"` ไม่ใช่ `EventKey` (type error ตอน transform)

- [ ] **Step 3: Write minimal implementation**

ใน `supabase/functions/_shared/notify.ts` เพิ่ม 4 จุด (ต่อจาก `calendar_sync_failed` ทุกจุด):

3a. `EventKey` union — เพิ่มบรรทัดสุดท้าย:

```typescript
  | "make_quota_warning";
```

3b. `EVENT_DEFAULTS` — เพิ่ม entry:

```typescript
  make_quota_warning: {
    title: "⚠️ โควตา Make.com ใกล้เต็ม",
    body: "เดือนนี้ใช้ไปแล้ว {used}/{limit} operations ({percent}%) เมื่อครบโควตาการซิงก์ปฏิทินจะหยุดจนถึงรอบถัดไป",
    link: "/dashboard/integrations",
  },
```

3c. `EVENT_KEYS` array — เพิ่ม:

```typescript
  "make_quota_warning",
```

3d. `DISCORD_MESSAGE_TEMPLATES` — เพิ่ม:

```typescript
  make_quota_warning: "⚠️ Make.com quota: {used}/{limit} ({percent}%)",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/notify.test.ts`
Expected: PASS ทั้งไฟล์ (test เดิม + ใหม่)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/notify.ts supabase/functions/_shared/notify.test.ts
git commit -m "$(cat <<'EOF'
feat(notify): add make_quota_warning event to registry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure quota logic (`sumUsageSinceReset`, `resolveLimit`, `tierFor`, `decideAction`)

**Files:**
- Create: `supabase/functions/_shared/makeQuota.ts`
- Test: `supabase/functions/_shared/makeQuota.test.ts`

**Interfaces:**
- Consumes: (none)
- Produces:
  - `interface UsageRow { date: string; operations: number }`
  - `sumUsageSinceReset(rows: UsageRow[], lastResetIso: string): number`
  - `resolveLimit(license: unknown): number`
  - `tierFor(used: number, limit: number): 0 | 80 | 95`
  - `type QuotaAction = "notify" | "reset" | "none"`
  - `decideAction(lastTier: number, currentTier: number): QuotaAction`

- [ ] **Step 1: Write the failing test**

สร้าง `supabase/functions/_shared/makeQuota.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  sumUsageSinceReset,
  resolveLimit,
  tierFor,
  decideAction,
  type UsageRow,
} from "./makeQuota.ts";

describe("sumUsageSinceReset", () => {
  const rows: UsageRow[] = [
    { date: "2026-07-17", operations: 100 }, // ก่อน reset — ไม่นับ
    { date: "2026-07-18", operations: 20 },  // วัน reset — นับ (inclusive)
    { date: "2026-07-20", operations: 30 },
    { date: "2026-08-01", operations: 5 },   // ข้ามเดือน — ยังนับ (อยู่ในรอบบิล)
  ];

  it("นับเฉพาะวันที่ >= วัน reset (date-only inclusive)", () => {
    expect(sumUsageSinceReset(rows, "2026-07-18T09:53:00.000Z")).toBe(55);
  });

  it("array ว่าง → 0", () => {
    expect(sumUsageSinceReset([], "2026-07-18T00:00:00Z")).toBe(0);
  });

  it("operations ไม่ใช่ number → ข้ามแถวนั้น", () => {
    const bad = [{ date: "2026-07-20", operations: undefined as unknown as number }];
    expect(sumUsageSinceReset(bad, "2026-07-18T00:00:00Z")).toBe(0);
  });
});

describe("resolveLimit", () => {
  it("license.operations เป็น number บวก → ใช้ค่านั้น", () => {
    expect(resolveLimit({ operations: 10000 })).toBe(10000);
  });
  it("license ไม่มี/รูปร่างไม่ตรง → fallback 1000", () => {
    expect(resolveLimit(undefined)).toBe(1000);
    expect(resolveLimit(null)).toBe(1000);
    expect(resolveLimit({})).toBe(1000);
    expect(resolveLimit({ operations: "many" })).toBe(1000);
    expect(resolveLimit({ operations: 0 })).toBe(1000);
  });
});

describe("tierFor", () => {
  it("ต่ำกว่า 80% → 0", () => {
    expect(tierFor(799, 1000)).toBe(0);
    expect(tierFor(0, 1000)).toBe(0);
  });
  it("80–94% → 80", () => {
    expect(tierFor(800, 1000)).toBe(80);
    expect(tierFor(949, 1000)).toBe(80);
  });
  it("95%+ → 95 (รวมเกิน 100%)", () => {
    expect(tierFor(950, 1000)).toBe(95);
    expect(tierFor(1200, 1000)).toBe(95);
  });
  it("limit <= 0 → 0 (กันหารศูนย์)", () => {
    expect(tierFor(500, 0)).toBe(0);
  });
});

describe("decideAction", () => {
  it("ข้ามขึ้น tier → notify (0→80, 80→95, 0→95)", () => {
    expect(decideAction(0, 80)).toBe("notify");
    expect(decideAction(80, 95)).toBe("notify");
    expect(decideAction(0, 95)).toBe("notify");
  });
  it("tier เท่าเดิม → none", () => {
    expect(decideAction(80, 80)).toBe("none");
    expect(decideAction(0, 0)).toBe("none");
  });
  it("tier ตกลง (รอบบิลใหม่) → reset", () => {
    expect(decideAction(95, 0)).toBe("reset");
    expect(decideAction(80, 0)).toBe("reset");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/makeQuota.test.ts`
Expected: FAIL — import unresolved

- [ ] **Step 3: Write minimal implementation**

สร้าง `supabase/functions/_shared/makeQuota.ts`:

```typescript
// ── Pure logic สำหรับ Make.com quota alert — ไม่แตะ network/env ──

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/makeQuota.test.ts`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/makeQuota.ts supabase/functions/_shared/makeQuota.test.ts
git commit -m "$(cat <<'EOF'
feat(make-quota): add pure quota computation logic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Transport `fetchMakeQuota` + orchestrator `runQuotaCheck`

**Files:**
- Modify: `supabase/functions/_shared/makeQuota.ts`
- Test: `supabase/functions/_shared/makeQuota.test.ts`

**Interfaces:**
- Consumes: `notifyAndLog` จาก `./notify.ts`; `logIntegration` จาก `./integrationLog.ts`; pure functions จาก Task 2; `makeClient` mock จาก `./mockClient.ts` (test)
- Produces:
  - `interface QuotaSnapshot { used: number; limit: number }`
  - `type FetchQuotaFn = () => Promise<QuotaSnapshot | null>` (null = ยังไม่ตั้ง secrets)
  - `fetchMakeQuota: FetchQuotaFn` (transport จริง — live-tested)
  - `runQuotaCheck(client: SupabaseClient, fetchQuota?: FetchQuotaFn): Promise<void>` (never-throw)

- [ ] **Step 1: Write the failing test**

เพิ่มท้าย `supabase/functions/_shared/makeQuota.test.ts` — อัปเดต import เป็น:

```typescript
import {
  sumUsageSinceReset,
  resolveLimit,
  tierFor,
  decideAction,
  runQuotaCheck,
  type UsageRow,
  type FetchQuotaFn,
} from "./makeQuota.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";
```

แล้วเพิ่ม:

```typescript
describe("runQuotaCheck", () => {
  // responder: system_config select (id/admin_id/last_tier + notify config), update ok,
  // notifications + integration_health insert ok
  function responder(overrides: { lastTier?: number; updateError?: boolean } = {}) {
    return (ctx: DbCallContext) => {
      if (ctx.table === "system_config" && ctx.op === "select") {
        return {
          data: {
            id: "cfg-1",
            admin_id: "adm1",
            make_quota_last_tier: overrides.lastTier ?? 0,
            welpru_enabled: false,
            discord_enabled: false,
            line_enabled: false,
            notification_settings: {},
          },
        };
      }
      if (ctx.table === "system_config" && ctx.op === "update") {
        return overrides.updateError ? { error: { message: "update boom" } } : {};
      }
      return {}; // notifications / integration_health inserts
    };
  }
  const snap = (used: number, limit = 1000): FetchQuotaFn => async () => ({ used, limit });

  it("ข้าม tier 0→80 → update state ก่อน แล้ว insert notification + log success", async () => {
    const { client, calls } = makeClient(responder());
    await runQuotaCheck(client as never, snap(820));
    const upd = calls.find((c: DbCallContext) => c.table === "system_config" && c.op === "update");
    expect(upd?.payload).toEqual({ make_quota_last_tier: 80 });
    const notif = calls.find(
      (c: DbCallContext) => c.table === "notifications" && c.op === "insert"
    );
    expect(notif?.payload).toMatchObject({ event_key: "make_quota_warning", user_id: "adm1" });
    expect(String(notif?.payload?.body)).toContain("820/1000");
    // state-first: update ต้องมาก่อน notification ใน call order
    const updIdx = calls.findIndex((c: DbCallContext) => c.op === "update");
    const notifIdx = calls.findIndex((c: DbCallContext) => c.table === "notifications");
    expect(updIdx).toBeLessThan(notifIdx);
    const log = calls.find((c: DbCallContext) => c.table === "integration_health");
    expect(log?.payload).toMatchObject({
      service: "make_com",
      status: "success",
      payload: { kind: "quota_check", used: 820, limit: 1000 },
    });
  });

  it("tier เท่าเดิม (80→80) → ไม่ update ไม่แจ้ง แต่ log success", async () => {
    const { client, calls } = makeClient(responder({ lastTier: 80 }));
    await runQuotaCheck(client as never, snap(850));
    expect(calls.some((c: DbCallContext) => c.op === "update")).toBe(false);
    expect(calls.some((c: DbCallContext) => c.table === "notifications")).toBe(false);
    expect(calls.some((c: DbCallContext) => c.table === "integration_health")).toBe(true);
  });

  it("tier ตก (95→0 รอบบิลใหม่) → update state แต่ไม่แจ้ง", async () => {
    const { client, calls } = makeClient(responder({ lastTier: 95 }));
    await runQuotaCheck(client as never, snap(50));
    const upd = calls.find((c: DbCallContext) => c.op === "update");
    expect(upd?.payload).toEqual({ make_quota_last_tier: 0 });
    expect(calls.some((c: DbCallContext) => c.table === "notifications")).toBe(false);
  });

  it("update state พัง → ห้ามแจ้ง (log failed)", async () => {
    const { client, calls } = makeClient(responder({ updateError: true }));
    await runQuotaCheck(client as never, snap(999));
    expect(calls.some((c: DbCallContext) => c.table === "notifications")).toBe(false);
    const log = calls.find((c: DbCallContext) => c.table === "integration_health");
    expect(log?.payload).toMatchObject({ service: "make_com", status: "failed" });
  });

  it("fetchQuota คืน null (secrets ไม่ตั้ง) → เงียบสนิท ไม่ log ไม่แจ้ง", async () => {
    const { client, calls } = makeClient(responder());
    await runQuotaCheck(client as never, async () => null);
    expect(calls).toHaveLength(0);
  });

  it("fetchQuota throw → log failed ไม่แจ้ง ไม่ throw", async () => {
    const { client, calls } = makeClient(responder());
    await expect(
      runQuotaCheck(client as never, async () => {
        throw new Error("make api down");
      })
    ).resolves.toBeUndefined();
    const log = calls.find((c: DbCallContext) => c.table === "integration_health");
    expect(log?.payload).toMatchObject({ service: "make_com", status: "failed" });
    expect(calls.some((c: DbCallContext) => c.table === "notifications")).toBe(false);
  });

  it("never-throw: db พังทุก call ก็ไม่ throw", async () => {
    const { client } = makeClient(() => {
      throw new Error("db down");
    });
    await expect(runQuotaCheck(client as never, snap(999))).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/makeQuota.test.ts -t "runQuotaCheck"`
Expected: FAIL — `runQuotaCheck` ไม่ถูก export

- [ ] **Step 3: Write minimal implementation**

เพิ่มท้าย `supabase/functions/_shared/makeQuota.ts` พร้อม import ที่หัวไฟล์:

```typescript
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { notifyAndLog } from "./notify.ts";
import { logIntegration } from "./integrationLog.ts";
```

และส่วน transport + orchestrator:

```typescript
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
```

- [ ] **Step 4: Run full file + suite to verify**

Run: `npx vitest run supabase/functions/_shared/makeQuota.test.ts` → PASS ทั้งหมด
Run: `npm run test` → PASS ทั้ง suite

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/makeQuota.ts supabase/functions/_shared/makeQuota.test.ts
git commit -m "$(cat <<'EOF'
feat(make-quota): add never-throw quota check orchestrator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Edge Function `check-make-quota` + migration + keep-alive trigger

**Files:**
- Create: `supabase/functions/check-make-quota/index.ts`
- Create: `supabase/migrations/024_make_quota_state.sql`
- Modify: `app/api/keep-alive/route.ts`

**Interfaces:**
- Consumes: `runQuotaCheck` จาก `../_shared/makeQuota.ts` (Task 3); `withErrorHandling` จาก `../_shared/handler.ts`
- Produces: endpoint `POST /functions/v1/check-make-quota` (verify_jwt default = ต้องมี Bearer JWT เช่น service role key)

- [ ] **Step 1: Create the Edge Function**

สร้าง `supabase/functions/check-make-quota/index.ts`:

```typescript
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
```

- [ ] **Step 2: Create the migration**

สร้าง `supabase/migrations/024_make_quota_state.sql`:

```sql
-- ============================================================
-- 024_make_quota_state.sql
-- เพิ่ม state สำหรับ dedupe การเตือนโควตา Make.com (tier 0/80/95)
-- additive เท่านั้น (Rule 8) — เขียนได้เฉพาะ service_role (migration 023)
-- ============================================================

ALTER TABLE system_config
  ADD COLUMN IF NOT EXISTS make_quota_last_tier integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN system_config.make_quota_last_tier IS
  'tier การเตือนโควตา Make.com ล่าสุดที่แจ้งไปแล้ว (0/80/95) — ใช้ dedupe; reset เป็น 0 อัตโนมัติเมื่อรอบบิลใหม่ usage ตกต่ำกว่า 80%';
```

- [ ] **Step 3: Wire keep-alive trigger**

ใน `app/api/keep-alive/route.ts` เพิ่มบล็อกนี้ **หลัง** heartbeat insert (`await supabase.from("integration_health").insert(...)`) และ **ก่อน** `if (error)`:

```typescript
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
```

หมายเหตุ: spec เขียนว่า "fire-and-forget" — implement เป็น awaited-non-fatal เพราะ Vercel serverless จะฆ่า promise ที่ลอยค้างหลัง response ถูกส่ง ผลลัพธ์เชิงพฤติกรรมเหมือนกัน (ไม่กระทบ keep-alive) และการันตีว่า check ได้รันจริง

- [ ] **Step 4: Verify full suite + build**

Run: `npm run test` → PASS ทั้งหมด (route ไม่มี unit test — โค้ดใหม่เป็น glue ล้วน)
Run: `npx tsc --noEmit 2>&1 | head -5` → ไม่มี error ใหม่ (ตรวจ route type)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/check-make-quota/index.ts supabase/migrations/024_make_quota_state.sql app/api/keep-alive/route.ts
git commit -m "$(cat <<'EOF'
feat(make-quota): add check-make-quota function, state migration, cron trigger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Ops — migration, secrets, deploy, live verify (ทำร่วมกับผู้ใช้)

**Files:** (ไม่มีไฟล์โค้ด)

- [ ] **Step 1: รัน migration 024 บน production**

เซสชันที่มี Supabase MCP: `apply_migration` ด้วยเนื้อหา `024_make_quota_state.sql` / ไม่มี MCP: ผู้ใช้รัน SQL ใน Dashboard SQL Editor แล้วยืนยันด้วย:

```sql
SELECT make_quota_last_tier FROM system_config;
```

Expected: `0`

- [ ] **Step 2: ผู้ใช้สร้าง Make API token + ตั้ง secrets** (ผู้ใช้ทำเอง — ห้ามแปะค่าในแชท)

ใน Make: Profile (มุมขวาบน) → **API Access → Add token** (scope อ่านอย่างเดียวพอ: `organizations:read`) และดู Organization ID จาก URL หน้า organization (`.../organization/<ตัวเลข>/dashboard`)

```bash
supabase secrets set MAKE_API_TOKEN=<token>
supabase secrets set MAKE_ORG_ID=<ตัวเลข org id>
supabase secrets list   # ยืนยันเห็นทั้งสองชื่อ
```

- [ ] **Step 3: Deploy functions**

```bash
# function ใหม่
npx supabase functions deploy check-make-quota --project-ref sbmbdngrutkjugsmmfxa
# ทุกตัวที่ import notify.ts (แก้ shared → redeploy ทั้งหมด)
npx supabase functions deploy approve-booking decide-cancellation direct-cancel-booking request-cancellation create-booking --project-ref sbmbdngrutkjugsmmfxa
npx supabase functions deploy line-webhook --no-verify-jwt --project-ref sbmbdngrutkjugsmmfxa
```

ยืนยัน: `npx supabase functions list --project-ref sbmbdngrutkjugsmmfxa` → ทุกตัว ACTIVE, `check-make-quota` verify_jwt=true, `line-webhook` verify_jwt=false

- [ ] **Step 4: Live verify — เรียกตรง**

ผู้ใช้ (หรือ agent ผ่าน curl กับ service key ที่ผู้ใช้ไม่ต้องแปะ — ใช้ `supabase functions invoke` ได้):

```bash
npx supabase functions invoke check-make-quota --project-ref sbmbdngrutkjugsmmfxa
```

Expected: `{"ok":true}` แล้วตรวจ:
1. หน้า `/dashboard/integrations` → การ์ด Make.com มี success เพิ่ม (payload kind=quota_check ใน DB)
2. usage จริงตอนนี้ ~8% → tier 0 → **ต้องไม่มี** notification ใหม่
3. `get_logs`/dashboard logs ของ `check-make-quota` ไม่มี error

- [ ] **Step 5: Live verify — จำลองการเตือน (ทางเลือก แนะนำ)**

จำลอง tier ข้ามขึ้นโดยไม่ต้องเผา credits: ตั้ง state ให้ต่ำกว่าจริงไม่ได้เพราะจริงอยู่ tier 0 อยู่แล้ว — ทางจำลองคือ**ลด limit ชั่วคราวไม่ได้** (มาจาก API) ดังนั้นวิธีเดียวที่สะอาด: ผู้ใช้แก้ `make_quota_last_tier` ไม่ช่วย (ต้องการทดสอบขาแจ้ง ไม่ใช่ขา reset)

วิธีทดสอบขาแจ้งแบบสะอาด: รัน SQL ชั่วคราวใน Dashboard ตั้ง `make_quota_last_tier = 0` (ค่าเดิมอยู่แล้ว) แล้ว**ทดสอบผ่าน unit test แทน** — ขาแจ้งถูกล็อกด้วย test "ข้าม tier 0→80" อยู่แล้ว การยิงจริงรอเหตุการณ์จริง (ตัวเลือก: ถ้าอยากเห็นข้อความจริง ให้ agent จำลองด้วยการเรียก `notifyAndLog` ตรงจากเซสชันที่มี MCP — YAGNI, ข้ามได้)

- [ ] **Step 6: Merge + push**

```bash
git checkout main
git merge --no-ff feat/make-quota-alert
npm run test   # ยืนยันบน merged main
git push origin main
git branch -d feat/make-quota-alert
```

(Vercel auto-deploy route `keep-alive` เวอร์ชันใหม่จาก push นี้ — cron รอบถัดไปจะเริ่ม trigger quota check อัตโนมัติ)

---

## Self-Review

**1. Spec coverage:**
- Event `make_quota_warning` 4 จุด + template → Task 1 ✓
- Pure logic sum/limit/tier/decide (รวม date-only inclusive, fallback 1000, กันหารศูนย์) → Task 2 ✓
- Transport 2 API calls + defensive unwrap + null เมื่อไม่ตั้ง secrets → Task 3 ✓
- Orchestrator: state-first, never-throw, API พัง → log failed ไม่แจ้ง, secrets ไม่ตั้ง → เงียบสนิท, Rule 5 log ทุกครั้ง → Task 3 (ทุกกรณีมี test) ✓
- Edge Function ห่อ withErrorHandling (Rule 1) → Task 4 ✓
- Migration additive (Rule 8) → Task 4 ✓
- keep-alive trigger (awaited-non-fatal + เหตุผล deviation จาก spec) → Task 4 ✓
- Ops: migration/secrets/deploy รวม redeploy 6 ตัวที่ import notify + live verify → Task 5 ✓

**2. Placeholder scan:** ไม่มี TBD/TODO — โค้ดเต็มทุก step ✓

**3. Type consistency:** `UsageRow`/`QuotaSnapshot`/`FetchQuotaFn`/`QuotaAction`/`runQuotaCheck(client, fetchQuota?)`/`make_quota_warning`/`make_quota_last_tier` ตรงกันทุก task ✓ (ตัวแปร template `{used}/{limit}/{percent}` ตรงระหว่าง Task 1 registry กับ Task 3 variables ✓)
