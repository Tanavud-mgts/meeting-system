import { describe, it, expect } from "vitest";
import {
  buildCreatePayload,
  buildDeletePayload,
  classifyMakeResponse,
  syncCalendarCreate,
  syncCalendarDelete,
  isMakeConfigured,
  type CreateRow,
  type DeleteRow,
  type SendFn,
} from "./makeComClient.ts";
import { RetryableHttpError } from "./retry.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";

const createRow: CreateRow = {
  id: "b1",
  ref_id: "BK-2026-0042",
  title: "ประชุมคณะกรรมการ",
  activity: "ประชุมประจำเดือน",
  attendees: 15,
  room_name: "ห้องประชุมชั้น 2",
  requester_name: "สมชาย ใจดี",
  start_time: "2026-07-25T02:00:00Z",
  end_time: "2026-07-25T04:00:00Z",
};

describe("buildCreatePayload", () => {
  it("ประกอบ payload create ครบทุกฟิลด์", () => {
    expect(buildCreatePayload(createRow)).toEqual({
      action: "create",
      booking_id: "b1",
      ref_id: "BK-2026-0042",
      title: "ประชุมคณะกรรมการ",
      activity: "ประชุมประจำเดือน",
      attendees: 15,
      room_name: "ห้องประชุมชั้น 2",
      requester_name: "สมชาย ใจดี",
      start_time: "2026-07-25T02:00:00Z",
      end_time: "2026-07-25T04:00:00Z",
    });
  });

  it("ไม่ส่ง requester_email ออกไป", () => {
    const payload = buildCreatePayload(createRow) as Record<string, unknown>;
    expect(payload.requester_email).toBeUndefined();
  });

  it("activity/attendees เป็น null → แทนด้วย '' และ 0", () => {
    const payload = buildCreatePayload({ ...createRow, activity: null, attendees: null });
    expect(payload.activity).toBe("");
    expect(payload.attendees).toBe(0);
  });
});

describe("buildDeletePayload", () => {
  it("ประกอบ payload delete ครบทุกฟิลด์", () => {
    const row: DeleteRow = { id: "b1", ref_id: "BK-2026-0042", gcal_event_id: "evt_abc" };
    expect(buildDeletePayload(row)).toEqual({
      action: "delete",
      booking_id: "b1",
      ref_id: "BK-2026-0042",
      gcal_event_id: "evt_abc",
    });
  });
});

describe("classifyMakeResponse", () => {
  it("2xx → ok", () => {
    expect(classifyMakeResponse(200)).toBe("ok");
    expect(classifyMakeResponse(204)).toBe("ok");
  });
  it("429 → RetryableHttpError", () => {
    expect(classifyMakeResponse(429)).toBeInstanceOf(RetryableHttpError);
  });
  it("5xx → RetryableHttpError", () => {
    expect(classifyMakeResponse(500)).toBeInstanceOf(RetryableHttpError);
    expect(classifyMakeResponse(503)).toBeInstanceOf(RetryableHttpError);
  });
  it("4xx (นอกจาก 429) → Error ธรรมดา ไม่ retry", () => {
    const r = classifyMakeResponse(403);
    expect(r).toBeInstanceOf(Error);
    expect(r).not.toBeInstanceOf(RetryableHttpError);
  });
});

// responder ครบสำหรับ create success/failure path (booking_detail, bookings update,
// integration_health, และ notify chain: system_config + notifications)
function orchestratorResponder(overrides: {
  gcalId?: string | null;
  updateError?: boolean;
} = {}) {
  return (ctx: DbCallContext) => {
    if (ctx.table === "booking_detail" && ctx.op === "select") {
      return {
        data: {
          id: "b1",
          ref_id: "BK-1",
          title: "ประชุม",
          activity: "a",
          attendees: 5,
          room_name: "ห้อง A",
          requester_name: "สมชาย",
          requester_id: "req1",
          start_time: "2026-07-25T02:00:00Z",
          end_time: "2026-07-25T04:00:00Z",
          gcal_event_id: "gcalId" in overrides ? overrides.gcalId : null,
          cancellation_reason: null,
        },
      };
    }
    if (ctx.table === "bookings" && ctx.op === "update") {
      return overrides.updateError ? { error: { message: "update boom" } } : {};
    }
    if (ctx.table === "system_config" && ctx.op === "select") {
      return { data: { admin_id: "adm1", approver1_id: null, approver2_id: null, welpru_enabled: false, discord_enabled: false, line_enabled: false, notification_settings: {} } };
    }
    return {}; // integration_health insert, notifications insert
  };
}

describe("syncCalendarCreate", () => {
  it("send สำเร็จ (มี gcal_event_id) → update bookings + log make_com success", async () => {
    const { client, calls } = makeClient(orchestratorResponder());
    const send: SendFn = async () => ({ gcal_event_id: "evt_new" });
    await syncCalendarCreate(client as never, "b1", send);
    const update = calls.find((c: DbCallContext) => c.table === "bookings" && c.op === "update");
    expect(update?.payload).toEqual({ gcal_event_id: "evt_new" });
    const log = calls.find((c: DbCallContext) => c.table === "integration_health" && c.op === "insert");
    expect(log?.payload).toMatchObject({ service: "make_com", status: "success" });
  });

  it("send throw → log make_com failed + แจ้ง calendar_sync_failed", async () => {
    const { client, calls } = makeClient(orchestratorResponder());
    const send: SendFn = async () => { throw new Error("network down"); };
    await syncCalendarCreate(client as never, "b1", send);
    const log = calls.find((c: DbCallContext) => c.table === "integration_health" && c.op === "insert");
    expect(log?.payload).toMatchObject({ service: "make_com", status: "failed" });
    const notif = calls.find((c: DbCallContext) => c.table === "notifications" && c.op === "insert");
    expect(notif?.payload).toMatchObject({ event_key: "calendar_sync_failed", user_id: "adm1" });
  });

  it("send คืน 200 แต่ไม่มี gcal_event_id → failed + แจ้ง", async () => {
    const { client, calls } = makeClient(orchestratorResponder());
    const send: SendFn = async () => ({});
    await syncCalendarCreate(client as never, "b1", send);
    const log = calls.find((c: DbCallContext) => c.table === "integration_health" && c.op === "insert");
    expect(log?.payload).toMatchObject({ service: "make_com", status: "failed" });
  });

  it("update bookings พัง (orphan event) → failed + แจ้ง", async () => {
    const { client, calls } = makeClient(orchestratorResponder({ updateError: true }));
    const send: SendFn = async () => ({ gcal_event_id: "evt_orphan" });
    await syncCalendarCreate(client as never, "b1", send);
    const log = calls.find((c: DbCallContext) => c.table === "integration_health" && c.op === "insert");
    expect(log?.payload).toMatchObject({ service: "make_com", status: "failed" });
    expect(String(log?.payload?.error_detail)).toContain("evt_orphan");
  });

  it("send คืน null (ไม่ได้ตั้งค่า Make) → ข้ามเงียบ ไม่ log ไม่แจ้ง", async () => {
    const { client, calls } = makeClient(orchestratorResponder());
    const send: SendFn = async () => null;
    await syncCalendarCreate(client as never, "b1", send);
    expect(calls.filter((c: DbCallContext) => c.table === "integration_health")).toHaveLength(0);
    expect(calls.filter((c: DbCallContext) => c.table === "notifications")).toHaveLength(0);
  });

  it("never-throw: db พังทุก call ก็ไม่ throw", async () => {
    const { client } = makeClient(() => { throw new Error("db down"); });
    const send: SendFn = async () => ({ gcal_event_id: "x" });
    await expect(syncCalendarCreate(client as never, "b1", send)).resolves.toBeUndefined();
  });
});

describe("syncCalendarDelete", () => {
  it("ไม่มี gcal_event_id → ข้าม ไม่เรียก send ไม่ log", async () => {
    const { client, calls } = makeClient(orchestratorResponder({ gcalId: null }));
    let sendCalled = false;
    const send: SendFn = async () => { sendCalled = true; return { ok: true }; };
    await syncCalendarDelete(client as never, "b1", send);
    expect(sendCalled).toBe(false);
    expect(calls.filter((c: DbCallContext) => c.table === "integration_health")).toHaveLength(0);
  });

  it("มี gcal_event_id + send สำเร็จ → log make_com success", async () => {
    const { client, calls } = makeClient(orchestratorResponder({ gcalId: "evt_del" }));
    const send: SendFn = async () => ({ ok: true });
    await syncCalendarDelete(client as never, "b1", send);
    const log = calls.find((c: DbCallContext) => c.table === "integration_health" && c.op === "insert");
    expect(log?.payload).toMatchObject({ service: "make_com", status: "success", payload: { action: "delete" } });
  });

  it("send throw → failed + แจ้ง", async () => {
    const { client, calls } = makeClient(orchestratorResponder({ gcalId: "evt_del" }));
    const send: SendFn = async () => { throw new Error("boom"); };
    await syncCalendarDelete(client as never, "b1", send);
    const log = calls.find((c: DbCallContext) => c.table === "integration_health" && c.op === "insert");
    expect(log?.payload).toMatchObject({ service: "make_com", status: "failed" });
    const notif = calls.find((c: DbCallContext) => c.table === "notifications" && c.op === "insert");
    expect(notif?.payload).toMatchObject({ event_key: "calendar_sync_failed" });
  });
});

describe("isMakeConfigured", () => {
  it("Deno ไม่มีใน test env → false (ไม่ throw)", () => {
    expect(isMakeConfigured()).toBe(false);
  });
});
