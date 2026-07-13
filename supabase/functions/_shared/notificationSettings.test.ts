import { describe, it, expect } from "vitest";
import { validateNotificationSettings, MAX_TITLE, MAX_BODY } from "./notificationSettings.ts";

describe("validateNotificationSettings", () => {
  it("object ว่าง → ok", () => {
    expect(validateNotificationSettings({})).toEqual({ ok: true, value: {} });
  });

  it("event + channel booleans + title/body ถูกต้อง → ok", () => {
    const input = {
      booking_approved: { discord: false, welpru: true, title: "หัวข้อ", body: "เนื้อหา" },
      line_quota_warning: { discord: true, title: null, body: null },
    };
    const r = validateNotificationSettings(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(input);
  });

  it("ไม่ใช่ object (null) → error", () => {
    expect(validateNotificationSettings(null).ok).toBe(false);
  });
  it("ไม่ใช่ object (array) → error", () => {
    expect(validateNotificationSettings([]).ok).toBe(false);
  });

  it("event key ไม่รู้จัก → error", () => {
    const r = validateNotificationSettings({ not_an_event: { discord: false } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("not_an_event");
  });

  it("channel ไม่ใช่ boolean → error", () => {
    expect(validateNotificationSettings({ booking_approved: { discord: "yes" } }).ok).toBe(false);
  });

  it("key แปลกใน event → error", () => {
    expect(validateNotificationSettings({ booking_approved: { foo: 1 } }).ok).toBe(false);
  });

  it("title ยาวเกิน MAX_TITLE → error", () => {
    expect(
      validateNotificationSettings({ booking_approved: { title: "x".repeat(MAX_TITLE + 1) } }).ok
    ).toBe(false);
  });

  it("body ยาวเกิน MAX_BODY → error", () => {
    expect(
      validateNotificationSettings({ booking_approved: { body: "x".repeat(MAX_BODY + 1) } }).ok
    ).toBe(false);
  });

  it("event value ไม่ใช่ object → error", () => {
    expect(validateNotificationSettings({ booking_approved: "x" }).ok).toBe(false);
  });

  it("returned value is a defensive copy (not same reference as input)", () => {
    const input = {
      booking_approved: { discord: false, welpru: true },
    };
    const r = validateNotificationSettings(input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toBe(input);
      expect(r.value.booking_approved).not.toBe(input.booking_approved);
    }
  });
});
