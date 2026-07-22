import { describe, it, expect } from "vitest";
import {
  buildCreatePayload,
  buildDeletePayload,
  classifyMakeResponse,
  type CreateRow,
  type DeleteRow,
} from "./makeComClient.ts";
import { RetryableHttpError } from "./retry.ts";

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
