import { describe, it, expect } from "vitest";
import {
  notifyBookingSubmitted,
  notifyApprovalOutcome,
  notifyCancellationRequested,
  notifyCancellationDecision,
  notifyBookingCancelledByAdmin,
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

// responder: booking_detail → detail, system_config → chain, notifications insert → ok
function responder(ctx: DbCallContext) {
  if (ctx.table === "booking_detail") return { data: detail };
  if (ctx.table === "system_config") return { data: chain };
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

describe("bookingNotify ไม่ throw เมื่อ db พัง", () => {
  it("booking_detail ไม่พบ → เงียบ ไม่ throw ไม่ insert", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "booking_detail") return { data: null, error: { message: "not found" } };
      throw new Error("should not reach");
    });
    await expect(notifyBookingSubmitted(client as never, "b1")).resolves.toBeUndefined();
    expect(inserts(calls)).toHaveLength(0);
  });
});
