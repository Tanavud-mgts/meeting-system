import { describe, it, expect } from "vitest";
import {
  applyTemplate,
  formatThaiDate,
  formatThaiTimeRange,
  buildNotification,
  notifyAndLog,
} from "./notify.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";

describe("applyTemplate", () => {
  it("แทนที่ตัวแปรทั้งหมด", () => {
    expect(applyTemplate("จอง {room} วันที่ {date}", { room: "ห้อง A", date: "15 ก.ค. 69" }))
      .toBe("จอง ห้อง A วันที่ 15 ก.ค. 69");
  });
  it("คงตัวแปรที่ไม่มีค่าไว้เป็น {key}", () => {
    expect(applyTemplate("สวัสดี {name}", {})).toBe("สวัสดี {name}");
  });
  it("ไม่มี vars คืน template เดิม", () => {
    expect(applyTemplate("คงเดิม")).toBe("คงเดิม");
  });
});

describe("formatThaiDate", () => {
  it("จัดรูปวันที่เป็น พ.ศ. ย่อ เลขอารบิก", () => {
    // 2026-07-15 07:00 UTC = 14:00 Asia/Bangkok → ยังเป็นวันที่ 15
    expect(formatThaiDate("2026-07-15T07:00:00Z")).toBe("15 ก.ค. 69");
  });
});

describe("formatThaiTimeRange", () => {
  it("จัดช่วงเวลาเป็น น. ตาม Asia/Bangkok", () => {
    // 02:00–05:00 UTC = 09:00–12:00 Asia/Bangkok
    expect(formatThaiTimeRange("2026-07-15T02:00:00Z", "2026-07-15T05:00:00Z"))
      .toBe("09:00–12:00 น.");
  });
});

describe("buildNotification", () => {
  it("booking_approved ใช้ default title/body/link", () => {
    const n = buildNotification("booking_approved", {
      room: "ห้องประชุม 1", date: "15 ก.ค. 69", time: "09:00–12:00 น.",
    });
    expect(n.title).toBe("✅ การจองได้รับอนุมัติแล้ว");
    expect(n.body).toBe("การจองห้องประชุม 1 วันที่ 15 ก.ค. 69 เวลา 09:00–12:00 น. ได้รับอนุมัติเรียบร้อยแล้ว");
    expect(n.link).toBe("/profile/bookings");
  });
  it("booking_rejected ใส่เหตุผล", () => {
    const n = buildNotification("booking_rejected", {
      room: "ห้อง A", date: "15 ก.ค. 69", reason: "ห้องซ่อมบำรุง",
    });
    expect(n.body).toContain("เหตุผล: ห้องซ่อมบำรุง");
  });
});

describe("notifyAndLog", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };

  it("insert 1 แถวต่อผู้รับ พร้อม title/body/link/event_key", async () => {
    const { client, calls } = makeClient(() => ({}));
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }, { userId: "u2" }],
      variables: vars,
    });
    const inserts = calls.filter((c: DbCallContext) => c.table === "notifications" && c.op === "insert");
    expect(inserts).toHaveLength(2);
    expect(inserts[0].payload).toMatchObject({
      user_id: "u1",
      event_key: "booking_approved",
      title: "✅ การจองได้รับอนุมัติแล้ว",
      link: "/profile/bookings",
    });
    expect(inserts[1].payload).toMatchObject({ user_id: "u2" });
  });

  it("ไม่ throw แม้ทุก insert ล้มเหลว", async () => {
    const { client } = makeClient(() => {
      throw new Error("db down");
    });
    await expect(
      notifyAndLog(client as never, {
        eventKey: "booking_approved",
        recipients: [{ userId: "u1" }],
        variables: vars,
      })
    ).resolves.toBeUndefined();
  });

  it("recipients ว่าง = ไม่ insert อะไร", async () => {
    const { client, calls } = makeClient(() => ({}));
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [],
      variables: vars,
    });
    expect(calls).toHaveLength(0);
  });

  it("insert สำเร็จ (resolve) แต่ response มี error field ไม่ throw", async () => {
    const { client, calls } = makeClient(() => ({ error: { message: "insert failed" } }));
    await expect(
      notifyAndLog(client as never, {
        eventKey: "booking_approved",
        recipients: [{ userId: "u1" }],
        variables: vars,
      })
    ).resolves.toBeUndefined();
    // confirms the call was actually attempted — proves this test exercises
    // the res.value.error branch (not the empty-recipients no-op path)
    expect(calls).toHaveLength(1);
  });
});
