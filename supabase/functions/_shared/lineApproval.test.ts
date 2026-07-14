import { describe, it, expect, vi } from "vitest";
import {
  createOrReuseApprovalToken,
  handleApprovalPostback,
  handleLinkCommand,
} from "./lineApproval.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";
import { ConflictError } from "./errors.ts";

describe("createOrReuseApprovalToken", () => {
  it("insert สำเร็จ → คืน token id ใหม่", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "insert")
        return { data: { id: "new-token" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const id = await createOrReuseApprovalToken(client as never, {
      bookingId: "b1", step: 1, approverId: "a1",
    });
    expect(id).toBe("new-token");
  });

  it("ชน 23505 (มี active token อยู่แล้ว) → SELECT ตัวเดิมมา reuse", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "insert")
        return { data: null, error: { code: "23505", message: "dup" } };
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { id: "existing-token" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const id = await createOrReuseApprovalToken(client as never, {
      bookingId: "b1", step: 1, approverId: "a1",
    });
    expect(id).toBe("existing-token");
  });

  it("error อื่น → null (ข้าม LINE เงียบ)", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "insert")
        return { data: null, error: { code: "XXXXX", message: "boom" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const id = await createOrReuseApprovalToken(client as never, {
      bookingId: "b1", step: 1, approverId: "a1",
    });
    expect(id).toBeNull();
  });
});

describe("handleApprovalPostback", () => {
  const base = { tokenId: "tok-1", action: "approve" as const, lineUserId: "U_line_1" };

  function depsSpy() {
    return {
      processApproval: vi.fn().mockResolvedValue({
        bookingId: "b1", step: 1, action: "approved", currentStep: 1, finalStatus: "pending",
      }),
      notifyApprovalOutcome: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("token ไม่พบ → reply แจ้ง ไม่เรียก processApproval", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: null, error: { message: "not found" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = depsSpy();
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(r.replyText).toContain("ไม่พบ");
    expect(deps.processApproval).not.toHaveBeenCalled();
  });

  it("identity ไม่ตรง (line_user_id ต่าง) → reply generic ไม่ consume ไม่ processApproval", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { booking_id: "b1", step: 1, approver_id: "a1", is_used: false } };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: "U_someone_else" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = depsSpy();
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(r.replyText).toContain("ตรวจสอบ");
    expect(deps.processApproval).not.toHaveBeenCalled();
    // ต้องไม่มี UPDATE (ไม่เผา token)
    expect(calls.find((c) => c.table === "approval_tokens" && c.op === "update")).toBeUndefined();
  });

  it("atomic consume คืนศูนย์แถว (ใช้แล้ว/หมดอายุ) → reply แจ้ง ไม่ processApproval", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { booking_id: "b1", step: 1, approver_id: "a1", is_used: false } };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: "U_line_1" } };
      if (ctx.table === "approval_tokens" && ctx.op === "update") return { data: [] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = depsSpy();
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(r.replyText).toContain("ดำเนินการไปแล้ว");
    expect(deps.processApproval).not.toHaveBeenCalled();
  });

  it("สำเร็จ → processApproval ถูกเรียกด้วย params จาก token + reply อนุมัติ + notifyApprovalOutcome", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { booking_id: "b1", step: 1, approver_id: "a1", is_used: false } };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: "U_line_1" } };
      if (ctx.table === "approval_tokens" && ctx.op === "update") return { data: [{ id: "tok-1" }] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = depsSpy();
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(deps.processApproval).toHaveBeenCalledWith(client, {
      bookingId: "b1", step: 1, approverId: "a1", action: "approved",
    });
    expect(deps.notifyApprovalOutcome).toHaveBeenCalledTimes(1);
    expect(r.replyText).toContain("อนุมัติเรียบร้อย");
  });

  it("processApproval throw ConflictError (เว็บตัดสินไปก่อน) → reply ดำเนินการไปแล้ว", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "approval_tokens" && ctx.op === "select")
        return { data: { booking_id: "b1", step: 1, approver_id: "a1", is_used: false } };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { line_user_id: "U_line_1" } };
      if (ctx.table === "approval_tokens" && ctx.op === "update") return { data: [{ id: "tok-1" }] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const deps = {
      processApproval: vi.fn().mockRejectedValue(new ConflictError("มีการดำเนินการนี้ไปแล้ว")),
      notifyApprovalOutcome: vi.fn(),
    };
    const r = await handleApprovalPostback(client as never, base, deps);
    expect(r.replyText).toContain("ดำเนินการไปแล้ว");
  });
});

describe("handleLinkCommand", () => {
  it("OTP ถูกต้อง → ผูก line_user_id + consent + reply สำเร็จ", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "line_link_tokens" && ctx.op === "update") return { data: [{ user_id: "u1" }] };
      if (ctx.table === "users" && ctx.op === "update") return {};
      if (ctx.table === "consent_records" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const r = await handleLinkCommand(client as never, { otp: "123456", lineUserId: "U_line_1" });
    expect(r.replyText).toContain("สำเร็จ");
    const usersUpdate = calls.find((c) => c.table === "users" && c.op === "update");
    expect(usersUpdate?.payload).toMatchObject({ line_user_id: "U_line_1" });
    const consent = calls.find((c) => c.table === "consent_records" && c.op === "insert");
    expect(consent?.payload).toMatchObject({ user_id: "u1", consent_type: "line_linking" });
  });

  it("OTP ผิด/หมดอายุ (consume ศูนย์แถว) → reply แจ้งขอรหัสใหม่ ไม่แตะ users", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "line_link_tokens" && ctx.op === "update") return { data: [] };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const r = await handleLinkCommand(client as never, { otp: "999999", lineUserId: "U_line_1" });
    expect(r.replyText).toContain("รหัสไม่ถูกต้อง");
    expect(calls.find((c) => c.table === "users")).toBeUndefined();
  });

  it("LINE นี้ผูกบัญชีอื่นแล้ว (23505) → reply แจ้ง", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "line_link_tokens" && ctx.op === "update") return { data: [{ user_id: "u1" }] };
      if (ctx.table === "consent_records" && ctx.op === "insert") return {};
      if (ctx.table === "users" && ctx.op === "update")
        return { error: { code: "23505", message: "dup" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const r = await handleLinkCommand(client as never, { otp: "123456", lineUserId: "U_line_1" });
    expect(r.replyText).toContain("ถูกเชื่อมกับผู้ใช้อื่น");
  });

  it("consent insert ล้มเหลว → reply เกิดข้อผิดพลาด ไม่แตะ users เลย (ห้าม link ถ้าไม่มี consent)", async () => {
    const calls: DbCallContext[] = [];
    const { client } = makeClient((ctx) => {
      calls.push(ctx);
      if (ctx.table === "line_link_tokens" && ctx.op === "update") return { data: [{ user_id: "u1" }] };
      if (ctx.table === "consent_records" && ctx.op === "insert")
        return { error: { code: "XXXXX", message: "insert failed" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    const r = await handleLinkCommand(client as never, { otp: "123456", lineUserId: "U_line_1" });
    expect(r.replyText).toContain("เกิดข้อผิดพลาด");
    expect(calls.find((c) => c.table === "users")).toBeUndefined();
  });
});
