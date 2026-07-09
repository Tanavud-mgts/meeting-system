import { describe, it, expect } from "vitest";
import {
  THAI_WEEKDAY_LABELS,
  buildWeekDays,
  weekRangeISO,
  bucketByDay,
} from "./homeWeek";

// อ้างอิงเวลาแบบ local — เลือกเที่ยงวันเพื่อเลี่ยงขอบเขตวัน
const NOW = new Date(2026, 6, 8, 12, 0, 0); // 8 ก.ค. 2026, 12:00 local

describe("buildWeekDays", () => {
  it("คืน 7 วัน เริ่มวันอาทิตย์", () => {
    const days = buildWeekDays(NOW);
    expect(days).toHaveLength(7);
    expect(days[0].date.getDay()).toBe(0); // อาทิตย์
    expect(days[6].date.getDay()).toBe(6); // เสาร์
  });

  it("label ตรงกับ getDay ของวันนั้น", () => {
    const days = buildWeekDays(NOW);
    for (const d of days) {
      expect(d.label).toBe(THAI_WEEKDAY_LABELS[d.date.getDay()]);
    }
  });

  it("มี isToday เป็น true เพียงวันเดียว และตรงกับวันของ now", () => {
    const days = buildWeekDays(NOW);
    const todays = days.filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].dayOfMonth).toBe(8);
  });

  it("count เริ่มต้นเป็น 0 ทุกวัน", () => {
    expect(buildWeekDays(NOW).every((d) => d.count === 0)).toBe(true);
  });
});

describe("weekRangeISO", () => {
  it("ช่วงยาว 7 วันพอดี และเริ่มเที่ยงคืนวันอาทิตย์", () => {
    const { startISO, endISO } = weekRangeISO(NOW);
    const start = new Date(startISO);
    const end = new Date(endISO);
    expect(start.getDay()).toBe(0);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(7 * 86400000);
  });
});

describe("bucketByDay", () => {
  const at = (d: Date, h: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString();

  it("นับหลายรายการในวันเดียวกันรวมถูก และข้ามรายการนอกช่วง", () => {
    const days = buildWeekDays(NOW);
    const beforeWeek = new Date(
      days[0].date.getFullYear(),
      days[0].date.getMonth(),
      days[0].date.getDate() - 1,
      10
    ).toISOString();
    const bookings = [
      { start_time: at(days[2].date, 9) },
      { start_time: at(days[2].date, 14) },
      { start_time: at(days[5].date, 10) },
      { start_time: beforeWeek }, // นอกช่วง ต้องถูกข้าม
    ];
    const result = bucketByDay(days, bookings);
    expect(result[2].count).toBe(2);
    expect(result[5].count).toBe(1);
    expect(result[0].count).toBe(0);
    expect(result.reduce((s, d) => s + d.count, 0)).toBe(3);
  });

  it("คืน array ใหม่ ไม่แก้ของเดิม", () => {
    const days = buildWeekDays(NOW);
    const result = bucketByDay(days, [{ start_time: at(days[1].date, 9) }]);
    expect(days[1].count).toBe(0); // ของเดิมไม่เปลี่ยน
    expect(result[1].count).toBe(1);
  });
});
