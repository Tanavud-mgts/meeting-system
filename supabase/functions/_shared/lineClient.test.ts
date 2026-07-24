import { describe, it, expect } from "vitest";
import { verifyLineSignature, parsePostbackData, buildApprovalFlex, isGroupContext } from "./lineClient.ts";

// helper: สร้างลายเซ็นที่ถูกต้องด้วยวิธีเดียวกับ implementation (HMAC-SHA256 → base64)
async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

describe("verifyLineSignature", () => {
  it("ลายเซ็นถูกต้อง → true", async () => {
    const body = '{"events":[]}';
    const secret = "test-secret";
    const sig = await sign(body, secret);
    expect(await verifyLineSignature(body, sig, secret)).toBe(true);
  });
  it("ลายเซ็นผิด → false", async () => {
    expect(await verifyLineSignature('{"events":[]}', "bad-signature", "test-secret")).toBe(false);
  });
  it("body ถูกแก้ (ลายเซ็นของ body อื่น) → false", async () => {
    const secret = "test-secret";
    const sig = await sign('{"events":[]}', secret);
    expect(await verifyLineSignature('{"events":[{"x":1}]}', sig, secret)).toBe(false);
  });
});

describe("parsePostbackData", () => {
  it("approve", () => {
    expect(parsePostbackData("a=approve&t=abc-123")).toEqual({ action: "approve", token: "abc-123" });
  });
  it("reject", () => {
    expect(parsePostbackData("a=reject&t=xyz")).toEqual({ action: "reject", token: "xyz" });
  });
  it("action ไม่รู้จัก → null", () => {
    expect(parsePostbackData("a=delete&t=abc")).toBeNull();
  });
  it("ไม่มี token → null", () => {
    expect(parsePostbackData("a=approve")).toBeNull();
  });
});

describe("isGroupContext", () => {
  it("source.type = group → true", () => {
    expect(isGroupContext({ type: "group", groupId: "C123" })).toBe(true);
  });
  it("source.type = room → true", () => {
    expect(isGroupContext({ type: "room", roomId: "R123" })).toBe(true);
  });
  it("มี groupId แต่ไม่มี type → true", () => {
    expect(isGroupContext({ groupId: "C123" })).toBe(true);
  });
  it("แชท 1:1 (type=user, มีแต่ userId) → false", () => {
    expect(isGroupContext({ type: "user" })).toBe(false);
  });
  it("source undefined → false", () => {
    expect(isGroupContext(undefined)).toBe(false);
  });
});

describe("buildApprovalFlex", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };
  it("altText ตรงกับที่ส่งมา + เป็น flex", () => {
    const flex = buildApprovalFlex(vars, "tok-1", "🔔 มีคำขอจองห้องประชุมใหม่") as {
      type: string; altText: string;
    };
    expect(flex.type).toBe("flex");
    expect(flex.altText).toBe("🔔 มีคำขอจองห้องประชุมใหม่");
  });
  it("ฝัง postback data ของทั้งปุ่มอนุมัติและปฏิเสธพร้อม token", () => {
    const json = JSON.stringify(buildApprovalFlex(vars, "tok-1", "x"));
    expect(json).toContain("a=approve&t=tok-1");
    expect(json).toContain("a=reject&t=tok-1");
  });
  it("แสดงรายละเอียดคำขอในการ์ด", () => {
    const json = JSON.stringify(buildApprovalFlex(vars, "tok-1", "x"));
    expect(json).toContain("สมชาย");
    expect(json).toContain("ห้อง A");
    expect(json).toContain("09:00–12:00 น.");
  });
});
