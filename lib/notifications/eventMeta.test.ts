import { describe, it, expect } from "vitest";
import { EVENT_META, applyTemplate, PREVIEW_VARS } from "./eventMeta";

describe("EVENT_META", () => {
  it("มีครบ 9 event", () => {
    expect(EVENT_META).toHaveLength(9);
  });
  it("ทุก event มี key/label/channels/default ครบ", () => {
    for (const m of EVENT_META) {
      expect(m.key).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.channels.length).toBeGreaterThan(0);
      expect(m.defaultTitle).toBeTruthy();
      expect(m.defaultBody).toBeTruthy();
    }
  });
  it("line_quota_warning มีแค่ discord (ไม่มี welpru/line)", () => {
    const m = EVENT_META.find((e) => e.key === "line_quota_warning")!;
    expect(m.channels).toEqual(["discord"]);
  });
  it("booking_submitted มี discord/welpru/line ครบ", () => {
    const m = EVENT_META.find((e) => e.key === "booking_submitted")!;
    expect(m.channels).toEqual(["discord", "welpru", "line"]);
  });
  it("booking_approved ไม่มี line (ไปหาผู้จอง ไม่มีปุ่ม)", () => {
    const m = EVENT_META.find((e) => e.key === "booking_approved")!;
    expect(m.channels).not.toContain("line");
  });
});

describe("applyTemplate", () => {
  it("แทนที่ตัวแปร", () => {
    expect(applyTemplate("จอง {room} {date}", { room: "ห้อง A", date: "15 ก.ค." }))
      .toBe("จอง ห้อง A 15 ก.ค.");
  });
  it("ตัวแปรขาดคง {key}", () => {
    expect(applyTemplate("สวัสดี {name}", {})).toBe("สวัสดี {name}");
  });
  it("PREVIEW_VARS ครอบคลุมตัวแปรใน default body ทุก event (ไม่เหลือ {x})", () => {
    for (const m of EVENT_META) {
      const rendered = applyTemplate(m.defaultBody, PREVIEW_VARS);
      expect(rendered).not.toMatch(/\{[a-z]+\}/);
    }
  });
});
