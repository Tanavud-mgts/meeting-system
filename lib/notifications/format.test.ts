import { describe, it, expect } from "vitest";
import { formatRelativeThai } from "./format";

const now = new Date("2026-07-15T12:00:00Z");

describe("formatRelativeThai", () => {
  it("น้อยกว่า 1 นาที = เมื่อสักครู่", () => {
    expect(formatRelativeThai("2026-07-15T11:59:40Z", now)).toBe("เมื่อสักครู่");
  });
  it("เป็นนาที", () => {
    expect(formatRelativeThai("2026-07-15T11:45:00Z", now)).toBe("15 นาทีที่แล้ว");
  });
  it("เป็นชั่วโมง", () => {
    expect(formatRelativeThai("2026-07-15T09:00:00Z", now)).toBe("3 ชั่วโมงที่แล้ว");
  });
  it("เป็นวัน", () => {
    expect(formatRelativeThai("2026-07-13T12:00:00Z", now)).toBe("2 วันที่แล้ว");
  });
});
