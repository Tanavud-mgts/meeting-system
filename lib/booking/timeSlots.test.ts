import { describe, it, expect } from "vitest";
import { buildTimeSlots, startOptions, endOptions } from "./timeSlots";

describe("buildTimeSlots", () => {
  it("office 8–17 คืน 19 ค่า เริ่ม 08:00 จบ 17:00", () => {
    const slots = buildTimeSlots(8, 17);
    expect(slots).toHaveLength(19);
    expect(slots[0]).toBe("08:00");
    expect(slots[1]).toBe("08:30");
    expect(slots[slots.length - 1]).toBe("17:00");
  });

  it("pad ชั่วโมงเลขหลักเดียวเป็นสองหลัก (9 → 09:00)", () => {
    expect(buildTimeSlots(9, 10)).toEqual(["09:00", "09:30", "10:00"]);
  });
});

describe("startOptions", () => {
  it("ตัดค่าสุดท้ายออก (เริ่มที่เวลาปิดไม่ได้)", () => {
    const slots = buildTimeSlots(8, 17);
    const opts = startOptions(slots);
    expect(opts).toHaveLength(18);
    expect(opts[opts.length - 1]).toBe("16:30");
    expect(opts).not.toContain("17:00");
  });
});

describe("endOptions", () => {
  it("คืนเฉพาะเวลาที่มากกว่าเวลาเริ่ม", () => {
    const slots = buildTimeSlots(8, 17);
    expect(endOptions(slots, "16:30")).toEqual(["17:00"]);
    expect(endOptions(slots, "08:00")[0]).toBe("08:30");
  });

  it("เวลาเริ่มว่างคืน array ว่าง", () => {
    expect(endOptions(buildTimeSlots(8, 17), "")).toEqual([]);
  });
});
