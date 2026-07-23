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
