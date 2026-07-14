import { describe, it, expect } from "vitest";
import { truncateText, safeLink, sendWelpruPush } from "./welpruClient.ts";

describe("truncateText", () => {
  it("ข้อความสั้นกว่า maxLen คืนค่าเดิม", () => {
    expect(truncateText("สวัสดี", 50)).toBe("สวัสดี");
  });

  it("ข้อความยาวกว่า maxLen ตัดด้วย ... ให้ความยาวรวมเท่า maxLen", () => {
    const text = "a".repeat(60);
    const result = truncateText(text, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith("...")).toBe(true);
  });

  it("maxLen สั้นมาก (<=3) ตัดตรงๆ ไม่เติม ...", () => {
    expect(truncateText("abcdef", 2)).toBe("ab");
  });
});

describe("safeLink", () => {
  it("link สั้นกว่า maxLen คืนค่าเดิม", () => {
    expect(safeLink("/approver", 255)).toBe("/approver");
  });

  it("link ยาวกว่า maxLen คืน undefined (drop ไม่ตัด)", () => {
    const link = "https://example.com/" + "a".repeat(250);
    expect(safeLink(link, 255)).toBeUndefined();
  });

  it("link เป็น undefined คืน undefined", () => {
    expect(safeLink(undefined, 255)).toBeUndefined();
  });
});

describe("sendWelpruPush", () => {
  it("staffIds ว่าง → success:true, failedCount:0 โดยไม่เรียก network", async () => {
    const result = await sendWelpruPush({ staffIds: [], title: "t", body: "b" });
    expect(result).toEqual({ success: true, failedCount: 0 });
  });
});
