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
    // confirms the insert was actually attempted — proves this test exercises
    // the res.value.error branch (not the empty-recipients no-op path).
    // NB (phase 2): notifyAndLog now also reads system_config first, so the
    // total call count is >1; filter for the notifications insert specifically
    // to keep asserting the original intent without coupling to that new read.
    const inserts = calls.filter(
      (c: DbCallContext) => c.table === "notifications" && c.op === "insert"
    );
    expect(inserts).toHaveLength(1);
  });
});

describe("buildNotification with override", () => {
  it("override.title/body มาก่อน default", () => {
    const n = buildNotification(
      "booking_approved",
      { room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." },
      { title: "หัวข้อกำหนดเอง", body: "เนื้อหากำหนดเอง {room}" }
    );
    expect(n.title).toBe("หัวข้อกำหนดเอง");
    expect(n.body).toBe("เนื้อหากำหนดเอง ห้อง A");
  });

  it("override เป็น undefined ใช้ default เหมือนเดิม", () => {
    const n = buildNotification("booking_approved", {
      room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น.",
    });
    expect(n.title).toBe("✅ การจองได้รับอนุมัติแล้ว");
  });

  it("override.title เป็น null (ไม่ใช่ undefined) ใช้ default เหมือนกัน", () => {
    const n = buildNotification(
      "booking_approved",
      { room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." },
      { title: null, body: null }
    );
    expect(n.title).toBe("✅ การจองได้รับอนุมัติแล้ว");
  });
});

describe("notifyAndLog — Discord/WeLPRU channel gating", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };

  it("discord_enabled=false (default) → ไม่มี logIntegration service=discord", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: false, discord_enabled: false, notification_settings: {} } };
      if (ctx.table === "users")
        return { data: { staff_id: null, welpru_verified_at: null } };
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const discordLogs = calls.filter((c: DbCallContext) => c.table === "integration_health");
    expect(discordLogs).toHaveLength(0);
  });

  it("discord_enabled=true → พยายามส่ง Discord และ log ผลลัพธ์ (ล้มเหลวเพราะไม่มี webhook ใน test env แต่ต้อง log)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: false, discord_enabled: true, notification_settings: {} } };
      if (ctx.table === "users")
        return { data: { staff_id: null, welpru_verified_at: null } };
      if (ctx.table === "integration_health") return {};
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const discordLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "discord"
    );
    expect(discordLogs).toHaveLength(1);
    expect(discordLogs[0].payload).toMatchObject({ status: "failed" }); // ไม่มี DISCORD_WEBHOOK_URL ใน test env
  });

  it("welpru_enabled=true แต่ผู้รับยังไม่ verified → ไม่เรียก WeLPRU เลย (ไม่มี log)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: true, discord_enabled: false, notification_settings: {} } };
      if (ctx.table === "users")
        return { data: { staff_id: "S001", welpru_verified_at: null } }; // ยังไม่ verified
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const welpruLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "welpru"
    );
    expect(welpruLogs).toHaveLength(0);
  });

  it("welpru_enabled=true และผู้รับ verified แล้ว → พยายามส่งและ log (ล้มเหลวเพราะไม่มี API key ใน test env)", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: true, discord_enabled: false, notification_settings: {} } };
      if (ctx.table === "users")
        return { data: { staff_id: "S001", welpru_verified_at: "2026-01-01T00:00:00Z" } };
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const welpruLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "welpru"
    );
    expect(welpruLogs).toHaveLength(1);
  });

  it("per-event override discord:false ปิดเฉพาะ event นี้แม้ master toggle เปิด", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return {
          data: {
            welpru_enabled: false,
            discord_enabled: true,
            notification_settings: { booking_approved: { discord: false } },
          },
        };
      if (ctx.table === "users") return { data: { staff_id: null, welpru_verified_at: null } };
      return {};
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_approved",
      recipients: [{ userId: "u1" }],
      variables: vars,
    });
    const discordLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "discord"
    );
    expect(discordLogs).toHaveLength(0);
  });

  it("system_config อ่านไม่ได้ (error) → ทุกช่องทางใหม่ปิดเงียบๆ ไม่ throw ไม่กระทบ in-app", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config") return { data: null, error: { message: "denied" } };
      if (ctx.table === "notifications" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      notifyAndLog(client as never, {
        eventKey: "booking_approved",
        recipients: [{ userId: "u1" }],
        variables: vars,
      })
    ).resolves.toBeUndefined();
    const inserts = calls.filter((c: DbCallContext) => c.table === "notifications" && c.op === "insert");
    expect(inserts).toHaveLength(1); // in-app ยังทำงานปกติ
  });

  it("system_config query THROW (reject ไม่ใช่ resolve-with-error) → ยังไม่ throw, in-app ทำงาน", async () => {
    // ★ ล็อกกฎ "ไม่ throw เด็ดขาด" สำหรับ config load ที่เพิ่มมาในเฟส 2 —
    //   ต่างจาก test ด้านบนที่ system_config resolve พร้อม error field, อันนี้
    //   responder throw จริง (mockClient แปลงเป็น Promise.reject) ถ้า
    //   loadNotificationConfig ไม่ห่อ try/catch, notifyAndLog จะ reject ตรงนี้
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config") throw new Error("boom");
      if (ctx.table === "notifications" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await expect(
      notifyAndLog(client as never, {
        eventKey: "booking_approved",
        recipients: [{ userId: "u1" }],
        variables: vars,
      })
    ).resolves.toBeUndefined();
    const inserts = calls.filter((c: DbCallContext) => c.table === "notifications" && c.op === "insert");
    expect(inserts).toHaveLength(1);
  });
});
