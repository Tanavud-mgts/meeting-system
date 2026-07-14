import { describe, it, expect } from "vitest";
import {
  truncateText,
  safeLink,
  sendWelpruPush,
  buildWelpruPayload,
  interpretQueued,
} from "./welpruClient.ts";

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

describe("buildWelpruPayload", () => {
  it("ส่ง field เป็น user_ids (array) ไม่ใช่ user_id (string) — regression กันบั๊กเดิม", () => {
    const p = buildWelpruPayload(["30051"], "t", "b");
    expect(p.user_ids).toEqual(["30051"]);
    expect((p as Record<string, unknown>).user_id).toBeUndefined();
  });

  it("รวมหลาย staffId เป็น array เดียว (ส่ง bulk ครั้งเดียว)", () => {
    const p = buildWelpruPayload(["30051", "30093", "STU6600001"], "t", "b");
    expect(p.user_ids).toEqual(["30051", "30093", "STU6600001"]);
  });

  it("ตัด title/body ตามขีดจำกัด + drop link ที่ยาวเกิน", () => {
    const p = buildWelpruPayload(
      ["30051"],
      "a".repeat(60),
      "b".repeat(300),
      "https://x/" + "c".repeat(300)
    );
    expect(p.title.length).toBe(50);
    expect(p.body.length).toBe(250);
    expect(p.link).toBeUndefined();
  });
});

describe("interpretQueued", () => {
  it("queued ครบทุกคน → success, failedCount 0", () => {
    expect(interpretQueued(2, 2)).toEqual({ success: true, failedCount: 0 });
  });

  it("queued 0 (API ตอบ 202 แต่ไม่ได้ queue จริง) → success:false — จับ false positive", () => {
    expect(interpretQueued(1, 0)).toEqual({ success: false, failedCount: 1 });
  });

  it("queued บางส่วน → failedCount = ส่วนต่าง", () => {
    expect(interpretQueued(3, 2)).toEqual({ success: true, failedCount: 1 });
  });
});

describe("sendWelpruPush", () => {
  it("staffIds ว่าง → success:true, failedCount:0 โดยไม่เรียก network", async () => {
    const result = await sendWelpruPush({ staffIds: [], title: "t", body: "b" });
    expect(result).toEqual({ success: true, failedCount: 0 });
  });
});
