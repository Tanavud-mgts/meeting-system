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
