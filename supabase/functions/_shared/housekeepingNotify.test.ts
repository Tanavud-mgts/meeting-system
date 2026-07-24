import { describe, it, expect } from "vitest";
import {
  addDaysISODate,
  bangkokDateString,
  bangkokHour,
  isNearTerm,
  buildDigestMessage,
  buildApprovedMessage,
  buildCancelledMessage,
  shouldSendDigestNow,
  type HousekeepingRow,
} from "./housekeepingNotify.ts";

const row = (over: Partial<HousekeepingRow> = {}): HousekeepingRow => ({
  ref_id: "BK-20260724-001",
  room_name: "ห้องประชุมสภา ชั้น 8",
  title: "ประชุมสภาวิชาการ",
  activity: "พิจารณาหลักสูตร",
  attendees: 25,
  start_time: "2026-07-24T02:00:00Z", // 09:00 Bangkok
  end_time: "2026-07-24T05:00:00Z",   // 12:00 Bangkok
  requester_name: "สมชาย ใจดี",
  requester_department: "คณะครุศาสตร์",
  notes_for_staff: null,
  ...over,
});

describe("addDaysISODate", () => {
  it("บวกวันข้ามเดือนถูกต้อง", () => {
    expect(addDaysISODate("2026-07-31", 1)).toBe("2026-08-01");
  });
});

describe("bangkokDateString / bangkokHour", () => {
  it("แปลง UTC เป็นวันที่/ชั่วโมง Asia/Bangkok (+7)", () => {
    // 2026-07-23T17:30:00Z = 2026-07-24 00:30 Bangkok
    expect(bangkokDateString("2026-07-23T17:30:00Z")).toBe("2026-07-24");
    expect(bangkokHour("2026-07-23T17:30:00Z")).toBe(0);
    expect(bangkokHour("2026-07-23T10:00:00Z")).toBe(17);
  });
});

describe("isNearTerm", () => {
  const now = "2026-07-23T03:00:00Z"; // 10:00 Bangkok, วันที่ 23
  it("start วันนี้ → today", () => {
    expect(isNearTerm("2026-07-23T06:00:00Z", now)).toBe("today");
  });
  it("start พรุ่งนี้ → tomorrow", () => {
    expect(isNearTerm("2026-07-24T06:00:00Z", now)).toBe("tomorrow");
  });
  it("start มะรืน → null", () => {
    expect(isNearTerm("2026-07-25T06:00:00Z", now)).toBeNull();
  });
  it("ขอบเขตข้ามเที่ยงคืน Bangkok คิดตามวันที่ Bangkok ไม่ใช่ UTC", () => {
    // now = 2026-07-23T18:00:00Z = 2026-07-24 01:00 Bangkok → "วันนี้" = 24
    const lateNow = "2026-07-23T18:00:00Z";
    expect(isNearTerm("2026-07-24T06:00:00Z", lateNow)).toBe("today");
    expect(isNearTerm("2026-07-25T06:00:00Z", lateNow)).toBe("tomorrow");
  });
});

describe("buildDigestMessage", () => {
  const forDate = "2026-07-24T00:00:00+07:00";
  it("ว่าง → ข้อความไม่มีการใช้ห้องประชุม", () => {
    const msg = buildDigestMessage([], forDate);
    expect(msg).toContain("ไม่มีการใช้ห้องประชุม");
  });
  it("มีรายการ → เรียงเวลา + ข้อมูลครบ", () => {
    const msg = buildDigestMessage([row()], forDate);
    expect(msg).toContain("1 รายการ");
    expect(msg).toContain("ห้องประชุมสภา ชั้น 8");
    expect(msg).toContain("25 คน");
    expect(msg).toContain("สมชาย ใจดี");
    expect(msg).toContain("คณะครุศาสตร์");
    expect(msg).toContain("BK-20260724-001");
  });
  it("มี notes_for_staff → แสดงบรรทัด 📝, ถ้าไม่มี → ไม่แสดง", () => {
    expect(buildDigestMessage([row({ notes_for_staff: "จัดโต๊ะรูปตัว U" })], forDate)).toContain("📝 จัดโต๊ะรูปตัว U");
    expect(buildDigestMessage([row()], forDate)).not.toContain("📝");
  });
});

describe("buildApprovedMessage / buildCancelledMessage", () => {
  it("approved → ป้าย ✅ + คำว่า (พรุ่งนี้) + notes", () => {
    const msg = buildApprovedMessage(row({ notes_for_staff: "เตรียมน้ำ 25 ที่" }), "tomorrow");
    expect(msg).toContain("✅");
    expect(msg).toContain("พรุ่งนี้");
    expect(msg).toContain("เตรียมน้ำ 25 ที่");
  });
  it("cancelled → ป้าย ❌ + (วันนี้) + ข้อความไม่ต้องเตรียม", () => {
    const msg = buildCancelledMessage(row(), "today");
    expect(msg).toContain("❌");
    expect(msg).toContain("วันนี้");
    expect(msg).toContain("ไม่ต้องเตรียมห้องนี้แล้ว");
  });
});

describe("shouldSendDigestNow", () => {
  const base = {
    housekeeping_enabled: true,
    housekeeping_line_group_id: "Cxxxx",
    housekeeping_digest_hour: 17,
    housekeeping_digest_last_sent_on: null,
  };
  const at17 = "2026-07-23T10:00:00Z"; // 17:00 Bangkok, วันที่ 23
  it("เปิด + ตรงชั่วโมง + ยังไม่ส่งวันนี้ → true", () => {
    expect(shouldSendDigestNow(base, at17)).toBe(true);
  });
  it("ปิดใช้งาน → false", () => {
    expect(shouldSendDigestNow({ ...base, housekeeping_enabled: false }, at17)).toBe(false);
  });
  it("ไม่มี group id → false", () => {
    expect(shouldSendDigestNow({ ...base, housekeeping_line_group_id: null }, at17)).toBe(false);
  });
  it("ยังไม่ถึงชั่วโมง → false", () => {
    expect(shouldSendDigestNow(base, "2026-07-23T09:00:00Z")).toBe(false); // 16:00
  });
  it("ส่งไปแล้ววันนี้ → false", () => {
    expect(shouldSendDigestNow({ ...base, housekeeping_digest_last_sent_on: "2026-07-23" }, at17)).toBe(false);
  });
});
