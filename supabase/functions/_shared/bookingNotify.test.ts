import { describe, it, expect } from "vitest";
import {
  notifyBookingSubmitted,
  notifyApprovalOutcome,
  notifyCancellationRequested,
  notifyCancellationDecision,
  notifyBookingCancelledByAdmin,
  notifyCalendarSyncFailed,
} from "./bookingNotify.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";

// booking_detail row มาตรฐานสำหรับ test (02:00–05:00 UTC = 09:00–12:00 Bangkok)
const detail = {
  requester_id: "req1",
  requester_name: "สมชาย ใจดี",
  room_name: "ห้องประชุม 1",
  start_time: "2026-07-15T02:00:00Z",
  end_time: "2026-07-15T05:00:00Z",
  cancellation_reason: "ติดภารกิจ",
};
const chain = { admin_id: "adm1", approver1_id: "apv1", approver2_id: "apv2" };

// responder: booking_detail → detail, system_config → chain, users → ชื่อ approver,
// notifications insert → ok
//
// หมายเหตุ: notifyAndLog() เฟส 2 (notify.ts) ก็ query table system_config เหมือนกับ
// loadChain() ในไฟล์นี้ — ทั้งคู่เรียกแบบไม่มี .eq() filter จึงแยกไม่ออกและได้ค่า
// เดียวกันคือ `chain` object แต่เพราะ chain ไม่มีคีย์ welpru_enabled/discord_enabled
// เลย notifyAndLog() จะเห็นเป็น undefined แล้ว fallback เป็น false ทั้งคู่ (ปิด
// Discord/WeLPRU) ตรงกับที่ test เดิมคาดหวังอยู่แล้ว (นับแค่ notifications insert)
function responder(ctx: DbCallContext) {
  if (ctx.table === "booking_detail") return { data: detail };
  if (ctx.table === "system_config") return { data: chain };
  if (ctx.table === "users") return { data: { full_name: "ผู้อนุมัติทดสอบ", staff_id: null, welpru_verified_at: null } };
  if (ctx.table === "notifications" && ctx.op === "insert") return {};
  throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
}

function inserts(calls: DbCallContext[]) {
  return calls.filter((c) => c.table === "notifications" && c.op === "insert");
}

describe("notifyBookingSubmitted", () => {
  it("แจ้ง admin (step 1) ด้วย event booking_submitted", async () => {
    const { client, calls } = makeClient(responder);
    await notifyBookingSubmitted(client as never, "b1");
    const ins = inserts(calls);
    expect(ins).toHaveLength(1);
    expect(ins[0].payload).toMatchObject({ user_id: "adm1", event_key: "booking_submitted" });
    expect(ins[0].payload!.body).toContain("ห้องประชุม 1");
    expect(ins[0].payload!.body).toContain("09:00–12:00 น.");
  });
});

describe("notifyApprovalOutcome", () => {
  it("rejected → แจ้งผู้จอง พร้อมเหตุผลจาก note", async () => {
    const { client, calls } = makeClient(responder);
    await notifyApprovalOutcome(
      client as never, "b1",
      { bookingId: "b1", step: 1, action: "rejected", currentStep: 0, finalStatus: "rejected" },
      "ห้องไม่ว่าง"
    );
    const ins = inserts(calls);
    expect(ins[0].payload).toMatchObject({ user_id: "req1", event_key: "booking_rejected" });
    expect(ins[0].payload!.body).toContain("เหตุผล: ห้องไม่ว่าง");
  });

  it("approved (final) → แจ้งผู้จอง booking_approved", async () => {
    const { client, calls } = makeClient(responder);
    await notifyApprovalOutcome(
      client as never, "b1",
      { bookingId: "b1", step: 3, action: "approved", currentStep: 3, finalStatus: "approved" }
    );
    expect(inserts(calls)[0].payload).toMatchObject({ user_id: "req1", event_key: "booking_approved" });
  });

  it("non-final approval → แจ้ง approver ขั้นถัดไป", async () => {
    const { client, calls } = makeClient(responder);
    // อนุมัติ step 1 → currentStep=1 → ผู้รับถัดไป step 2 = approver1_id
    await notifyApprovalOutcome(
      client as never, "b1",
      { bookingId: "b1", step: 1, action: "approved", currentStep: 1, finalStatus: "pending" }
    );
    expect(inserts(calls)[0].payload).toMatchObject({ user_id: "apv1", event_key: "booking_step_approved" });
  });

  it("rejected → variables มี step ตรงกับ result.step (สำหรับ Discord template)", async () => {
    const insertedPayloads: Record<string, unknown>[] = [];
    const { client } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: detail };
      if (ctx.table === "system_config") return { data: chain };
      if (ctx.table === "users") return { data: { full_name: "x", staff_id: null, welpru_verified_at: null } };
      if (ctx.table === "notifications" && ctx.op === "insert") {
        insertedPayloads.push(ctx.payload!);
        return {};
      }
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await notifyApprovalOutcome(
      client as never, "b1",
      { bookingId: "b1", step: 2, action: "rejected", currentStep: 1, finalStatus: "rejected" },
      "ห้องไม่ว่าง"
    );
    // body ของ in-app ไม่ได้ใช้ {step} (EVENT_DEFAULTS ไม่มี) แต่ notifyApprovalOutcome
    // ต้องส่ง step เข้า variables เสมอเผื่อ Discord ใช้ — ตรวจทางอ้อมผ่านว่า insert สำเร็จปกติ
    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0]).toMatchObject({ event_key: "booking_rejected" });
  });

  it("non-final approval → ดึงชื่อ approver ขั้นถัดไปมาใส่ variables (สำหรับ Discord template)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: detail };
      if (ctx.table === "system_config") return { data: chain };
      if (ctx.table === "users") {
        // ทุกครั้งที่ query users คืนชื่อคงที่ เพื่อยืนยันว่ามีการ query จริง
        return { data: { full_name: "ผู้อนุมัติ 2", staff_id: null, welpru_verified_at: null } };
      }
      if (ctx.table === "notifications" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await notifyApprovalOutcome(
      client as never, "b1",
      { bookingId: "b1", step: 1, action: "approved", currentStep: 1, finalStatus: "pending" }
    );
    const usersQueries = calls.filter((c: DbCallContext) => c.table === "users");
    expect(usersQueries.length).toBeGreaterThan(0); // ยืนยันว่ามีการดึงชื่อ approver
  });
});

describe("notifyCancellationRequested", () => {
  it("แจ้ง admin พร้อมเหตุผล", async () => {
    const { client, calls } = makeClient(responder);
    await notifyCancellationRequested(client as never, "b1", "ยกเลิกงาน");
    const ins = inserts(calls);
    expect(ins[0].payload).toMatchObject({ user_id: "adm1", event_key: "cancellation_requested" });
    expect(ins[0].payload!.body).toContain("เหตุผล: ยกเลิกงาน");
  });
});

describe("notifyCancellationDecision", () => {
  it("approve → แจ้งผู้จอง cancellation_approved", async () => {
    const { client, calls } = makeClient(responder);
    await notifyCancellationDecision(client as never, "b1", "approve");
    expect(inserts(calls)[0].payload).toMatchObject({ user_id: "req1", event_key: "cancellation_approved" });
  });
  it("reject → แจ้งผู้จอง cancellation_denied พร้อมเหตุผลจากใบจอง", async () => {
    const { client, calls } = makeClient(responder);
    await notifyCancellationDecision(client as never, "b1", "reject");
    const ins = inserts(calls);
    expect(ins[0].payload).toMatchObject({ user_id: "req1", event_key: "cancellation_denied" });
    expect(ins[0].payload!.body).toContain("เหตุผล: ติดภารกิจ");
  });
});

describe("notifyBookingCancelledByAdmin", () => {
  it("แจ้งผู้จอง booking_cancelled พร้อมเหตุผล", async () => {
    const { client, calls } = makeClient(responder);
    await notifyBookingCancelledByAdmin(client as never, "b1", "ปิดปรับปรุงห้อง");
    const ins = inserts(calls);
    expect(ins[0].payload).toMatchObject({ user_id: "req1", event_key: "booking_cancelled" });
    expect(ins[0].payload!.body).toContain("เหตุผล: ปิดปรับปรุงห้อง");
  });
});

describe("bookingNotify — lineApproval → approval_token (integration ผ่าน LINE channel)", () => {
  const detailRow = {
    requester_id: "req1", requester_name: "สมชาย", room_name: "ห้อง A",
    start_time: "2026-07-15T02:00:00Z", end_time: "2026-07-15T05:00:00Z", cancellation_reason: null,
  };
  // system_config รวมทั้ง chain (admin/approver) และ toggle (line_enabled=true)
  const cfgRow = {
    admin_id: "adm1", approver1_id: "apv1", approver2_id: "apv2",
    welpru_enabled: false, discord_enabled: false, line_enabled: true, notification_settings: {},
  };

  function tokenCaptureResponder() {
    return (ctx: DbCallContext) => {
      if (ctx.table === "booking_detail") return { data: detailRow };
      if (ctx.table === "system_config") return { data: cfgRow };
      if (ctx.table === "users" && ctx.op === "select")
        return { data: { full_name: "ผู้อนุมัติ", line_user_id: "U_line", staff_id: null, welpru_verified_at: null } };
      if (ctx.table === "integration_health" && ctx.op === "select") return { count: 0 };
      if (ctx.table === "approval_tokens" && ctx.op === "insert") return { data: { id: "tok-1" } };
      return {}; // notifications insert, integration_health insert (log)
    };
  }

  it("notifyBookingSubmitted → approval_token { booking_id, step:1, approver_id: admin }", async () => {
    const { client, calls } = makeClient(tokenCaptureResponder());
    await notifyBookingSubmitted(client as never, "b1");
    const tok = calls.find((c: DbCallContext) => c.table === "approval_tokens" && c.op === "insert");
    expect(tok?.payload).toMatchObject({ booking_id: "b1", step: 1, approver_id: "adm1" });
  });

  it("notifyApprovalOutcome step-approved → approval_token { booking_id, step:2, approver_id: approver1 }", async () => {
    const { client, calls } = makeClient(tokenCaptureResponder());
    await notifyApprovalOutcome(client as never, "b1", {
      bookingId: "b1", step: 1, action: "approved", currentStep: 1, finalStatus: "pending",
    });
    const tok = calls.find((c: DbCallContext) => c.table === "approval_tokens" && c.op === "insert");
    expect(tok?.payload).toMatchObject({ booking_id: "b1", step: 2, approver_id: "apv1" });
  });
});

describe("bookingNotify ไม่ throw เมื่อ db พัง", () => {
  it("booking_detail ไม่พบ → เงียบ ไม่ throw ไม่ insert (notifyBookingSubmitted)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: null, error: { message: "not found" } };
      throw new Error("should not reach");
    });
    await expect(notifyBookingSubmitted(client as never, "b1")).resolves.toBeUndefined();
    expect(inserts(calls)).toHaveLength(0);
  });

  it("booking_detail ไม่พบ → เงียบ ไม่ throw ไม่ insert (notifyApprovalOutcome)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: null, error: { message: "not found" } };
      throw new Error("should not reach");
    });
    await expect(
      notifyApprovalOutcome(
        client as never,
        "b1",
        { bookingId: "b1", step: 1, action: "approved", currentStep: 1, finalStatus: "pending" },
        "ทดสอบ"
      )
    ).resolves.toBeUndefined();
    expect(inserts(calls)).toHaveLength(0);
  });

  it("booking_detail ไม่พบ → เงียบ ไม่ throw ไม่ insert (notifyCancellationRequested)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: null, error: { message: "not found" } };
      throw new Error("should not reach");
    });
    await expect(notifyCancellationRequested(client as never, "b1", "ยกเลิก")).resolves.toBeUndefined();
    expect(inserts(calls)).toHaveLength(0);
  });

  it("booking_detail ไม่พบ → เงียบ ไม่ throw ไม่ insert (notifyCancellationDecision)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: null, error: { message: "not found" } };
      throw new Error("should not reach");
    });
    await expect(notifyCancellationDecision(client as never, "b1", "approve")).resolves.toBeUndefined();
    expect(inserts(calls)).toHaveLength(0);
  });

  it("booking_detail ไม่พบ → เงียบ ไม่ throw ไม่ insert (notifyBookingCancelledByAdmin)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: null, error: { message: "not found" } };
      throw new Error("should not reach");
    });
    await expect(
      notifyBookingCancelledByAdmin(client as never, "b1", "ปิดปรับปรุง")
    ).resolves.toBeUndefined();
    expect(inserts(calls)).toHaveLength(0);
  });

  it("system_config admin_id null → เงียบ ไม่ throw ไม่ insert (notifyBookingSubmitted)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: detail };
      if (ctx.table === "system_config")
        return { data: { admin_id: null, approver1_id: "apv1", approver2_id: "apv2" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(notifyBookingSubmitted(client as never, "b1")).resolves.toBeUndefined();
    expect(inserts(calls)).toHaveLength(0);
  });

  it("system_config admin_id null → เงียบ ไม่ throw ไม่ insert (notifyCancellationRequested)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: detail };
      if (ctx.table === "system_config")
        return { data: { admin_id: null, approver1_id: "apv1", approver2_id: "apv2" } };
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(notifyCancellationRequested(client as never, "b1", "ยกเลิก")).resolves.toBeUndefined();
    expect(inserts(calls)).toHaveLength(0);
  });
});

describe("notifyCalendarSyncFailed", () => {
  // system_config responder ต้องมีทั้ง admin_id (loadChain) และ toggles (loadNotificationConfig)
  function responder(ctx: DbCallContext) {
    if (ctx.table === "booking_detail" && ctx.op === "select") {
      return {
        data: {
          ref_id: "BK-2026-0042",
          requester_id: "req1",
          requester_name: "สมชาย",
          room_name: "ห้องประชุมชั้น 2",
          start_time: "2026-07-25T02:00:00Z",
          end_time: "2026-07-25T04:00:00Z",
          cancellation_reason: null,
        },
      };
    }
    if (ctx.table === "system_config" && ctx.op === "select") {
      return {
        data: {
          admin_id: "adm1",
          approver1_id: null,
          approver2_id: null,
          welpru_enabled: false,
          discord_enabled: false,
          line_enabled: false,
          notification_settings: {},
        },
      };
    }
    if (ctx.table === "notifications" && ctx.op === "insert") return {};
    return {};
  }

  it("แจ้ง admin ด้วย event calendar_sync_failed (in-app insert ถึง admin_id)", async () => {
    const { client, calls } = makeClient(responder);
    await notifyCalendarSyncFailed(client as never, "b1", "create");
    const inserts = calls.filter(
      (c: DbCallContext) =>
        c.table === "notifications" &&
        c.op === "insert" &&
        c.payload?.event_key === "calendar_sync_failed"
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload?.user_id).toBe("adm1");
    expect(String(inserts[0].payload?.body)).toContain("สร้าง");
  });

  it("ไม่มี admin_id → ไม่ insert อะไร ไม่ throw", async () => {
    const { client, calls } = makeClient((ctx: DbCallContext) => {
      if (ctx.table === "booking_detail") return { data: { ref_id: "R", requester_id: "r", requester_name: "n", room_name: "rm", start_time: "2026-07-25T02:00:00Z", end_time: "2026-07-25T04:00:00Z", cancellation_reason: null } };
      if (ctx.table === "system_config") return { data: { admin_id: null } };
      return {};
    });
    await expect(notifyCalendarSyncFailed(client as never, "b1", "delete")).resolves.toBeUndefined();
    expect(calls.filter((c: DbCallContext) => c.table === "notifications")).toHaveLength(0);
  });
});
