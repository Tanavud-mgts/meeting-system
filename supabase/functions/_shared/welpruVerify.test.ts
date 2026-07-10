import { describe, it, expect, vi } from "vitest";
import { requestWelpruVerify, confirmWelpruVerify } from "./welpruVerify.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";
import { ValidationError, ConflictError, ForbiddenError } from "./errors.ts";

describe("requestWelpruVerify", () => {
  it("throw ValidationError ถ้า staffId ว่าง", async () => {
    const { client } = makeClient(() => {
      throw new Error("db should not be called");
    });
    const sendPush = vi.fn();
    await expect(
      requestWelpruVerify(client as never, { userId: "u1", staffId: "  ", siteUrl: "https://x.test" }, sendPush)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("insert token แล้วเรียก sendPush พร้อม deep link ที่มี token", async () => {
    let insertedPayload: Record<string, unknown> | undefined;
    const { client } = makeClient((ctx) => {
      if (ctx.table === "welpru_link_tokens" && ctx.op === "insert") {
        insertedPayload = ctx.payload;
        return {};
      }
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const sendPush = vi.fn().mockResolvedValue({ success: true, failedCount: 0 });

    const result = await requestWelpruVerify(
      client as never,
      { userId: "u1", staffId: "S001", siteUrl: "https://example.test" },
      sendPush
    );

    expect(insertedPayload).toMatchObject({ user_id: "u1", staff_id: "S001" });
    expect(result.token).toBe(insertedPayload!.token);
    expect(sendPush).toHaveBeenCalledTimes(1);
    const pushArg = sendPush.mock.calls[0][0];
    expect(pushArg.staffIds).toEqual(["S001"]);
    expect(pushArg.link).toContain("https://example.test/profile/welpru-verify?token=");
    expect(pushArg.link).toContain(result.token);
  });
});

describe("confirmWelpruVerify", () => {
  it("throw ConflictError ถ้า token ไม่พบ/ใช้แล้ว/หมดอายุ (update คืนแถวว่าง)", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "welpru_link_tokens" && ctx.op === "update") return { data: [] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      confirmWelpruVerify(client as never, { userId: "u1", token: "bad-token" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throw ConflictError ถ้า staff_id ปัจจุบันของ user ไม่ตรงกับตอนขอยืนยัน", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "welpru_link_tokens" && ctx.op === "update")
        return { data: [{ staff_id: "S001" }] };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { staff_id: "S999" } }; // เปลี่ยนไปแล้วหลังขอยืนยัน
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      confirmWelpruVerify(client as never, { userId: "u1", token: "tok1" })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throw ForbiddenError ถ้าหา user ไม่เจอหลัง update token สำเร็จ", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "welpru_link_tokens" && ctx.op === "update")
        return { data: [{ staff_id: "S001" }] };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: null, error: { message: "not found" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      confirmWelpruVerify(client as never, { userId: "u1", token: "tok1" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("สำเร็จ: staff_id ตรงกัน → set welpru_verified_at + insert consent_records", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "welpru_link_tokens" && ctx.op === "update")
        return { data: [{ staff_id: "S001" }] };
      if (ctx.table === "users" && ctx.op === "select") return { data: { staff_id: "S001" } };
      if (ctx.table === "users" && ctx.op === "update") return {};
      if (ctx.table === "consent_records" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      confirmWelpruVerify(client as never, { userId: "u1", token: "tok1" })
    ).resolves.toBeUndefined();

    const usersUpdate = calls.find((c) => c.table === "users" && c.op === "update");
    expect(usersUpdate?.payload).toHaveProperty("welpru_verified_at");

    const consentInsert = calls.find((c) => c.table === "consent_records" && c.op === "insert");
    expect(consentInsert?.payload).toMatchObject({ user_id: "u1", consent_type: "welpru_linking" });
  });
});
