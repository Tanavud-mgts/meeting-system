import { describe, it, expect } from "vitest";
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
    expect(resolveLimit({ operations: -5 })).toBe(1000);
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

describe("runQuotaCheck", () => {
  // responder: system_config select (id/admin_id/last_tier + notify config), update ok,
  // notifications + integration_health insert ok
  function responder(
    overrides: { lastTier?: number; updateError?: boolean; adminId?: string | null } = {}
  ) {
    return (ctx: DbCallContext) => {
      if (ctx.table === "system_config" && ctx.op === "select") {
        return {
          data: {
            id: "cfg-1",
            admin_id: "adminId" in overrides ? overrides.adminId : "adm1",
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

  it("tier ขึ้นแต่ไม่มี admin_id → update state, ไม่แจ้ง, log failed skipped:no_admin_id", async () => {
    const { client, calls } = makeClient(responder({ adminId: null }));
    await runQuotaCheck(client as never, snap(820));
    // state ยังต้องขึ้น
    const upd = calls.find((c: DbCallContext) => c.table === "system_config" && c.op === "update");
    expect(upd?.payload).toEqual({ make_quota_last_tier: 80 });
    // ไม่มี notification
    expect(calls.some((c: DbCallContext) => c.table === "notifications")).toBe(false);
    // มี log failed ที่ทิ้งร่องรอยว่า alert หลุด
    const skipLog = calls.find(
      (c: DbCallContext) =>
        c.table === "integration_health" &&
        (c.payload?.payload as { skipped?: string } | undefined)?.skipped === "no_admin_id"
    );
    expect(skipLog?.payload).toMatchObject({ service: "make_com", status: "failed" });
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
