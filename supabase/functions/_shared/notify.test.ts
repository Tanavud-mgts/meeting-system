import { describe, it, expect } from "vitest";
import {
  applyTemplate,
  formatThaiDate,
  formatThaiTimeRange,
  buildNotification,
  buildDiscordMessage,
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

describe("line_quota_warning event (registry)", () => {
  it("buildNotification มี default title/body/link", () => {
    const n = buildNotification("line_quota_warning", { sent: "410" });
    expect(n.title).toBe("⚠️ โควตา LINE ใกล้เต็ม");
    expect(n.body).toBe("เดือนนี้ส่งไปแล้ว 410/500 ข้อความ เมื่อครบโควตาระบบจะหยุดส่งทาง LINE อัตโนมัติ");
    expect(n.link).toBe("/dashboard/integrations");
  });
});

describe("notifyAndLog — line_enabled config", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };

  it("line_enabled=false (default) + มี lineApproval → ไม่มี logIntegration service=line", async () => {
    const { client, calls } = makeClient((ctx) => {
      if (ctx.table === "system_config")
        return { data: { welpru_enabled: false, discord_enabled: false, line_enabled: false, notification_settings: {} } };
      if (ctx.table === "notifications" && ctx.op === "insert") return {};
      throw new Error(`unexpected: ${ctx.table}.${ctx.op}`);
    });
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted",
      recipients: [{ userId: "adm1" }],
      variables: vars,
      lineApproval: { bookingId: "b1", step: 1, approverId: "adm1" },
    });
    const lineLogs = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.payload?.service === "line"
    );
    expect(lineLogs).toHaveLength(0);
  });
});

describe("notifyAndLog — LINE channel", () => {
  const vars = { booker: "สมชาย", room: "ห้อง A", date: "15 ก.ค. 69", time: "09:00–12:00 น." };
  const lineApproval = { bookingId: "b1", step: 1, approverId: "adm1" };

  // responder มาตรฐาน: config เปิด line, approver มี line_user_id, quota นับได้, token สร้างได้
  function lineResponder(overrides: {
    lineEnabled?: boolean;
    lineUserId?: string | null;
    pushCount?: number;
    warnCount?: number;
    onInsert?: (ctx: DbCallContext) => void;
  } = {}) {
    return (ctx: DbCallContext) => {
      if (ctx.table === "system_config" && ctx.op === "select") {
        // แยกระหว่าง loadNotificationConfig (มี welpru_enabled) กับ maybeFireQuotaWarning (admin_id)
        return {
          data: {
            welpru_enabled: false,
            discord_enabled: false,
            line_enabled: overrides.lineEnabled ?? true,
            notification_settings: {},
            admin_id: "adm1",
          },
        };
      }
      if (ctx.table === "users" && ctx.op === "select")
        return {
          data: {
            line_user_id: "lineUserId" in overrides ? overrides.lineUserId : "U_line_1",
            staff_id: null,
            welpru_verified_at: null,
          },
        };
      if (ctx.table === "integration_health" && ctx.op === "select")
        return { count: overrides.pushCount ?? 0 }; // quota count
      if (ctx.table === "notifications" && ctx.op === "select")
        return { count: overrides.warnCount ?? 0 }; // dedupe count
      if (ctx.table === "approval_tokens" && ctx.op === "insert")
        return { data: { id: "tok-1" } };
      if (ctx.op === "insert") {
        overrides.onInsert?.(ctx);
        return {};
      }
      return {};
    };
  }

  it("line_enabled + lineApproval + มี line_user_id + quota ว่าง → log service=line push success", async () => {
    const { client, calls } = makeClient(lineResponder());
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    const lineLog = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.op === "insert" && c.payload?.service === "line"
    );
    expect(lineLog).toHaveLength(1);
    expect(lineLog[0].payload).toMatchObject({ status: "failed", payload: { kind: "push" } });
    // status failed เพราะ pushFlex เรียก Deno.env (ไม่มีใน test) → throw → caught → log failed
  });

  it("ไม่มี lineApproval → ข้าม LINE (ไม่มี token insert)", async () => {
    const { client, calls } = makeClient(lineResponder());
    await notifyAndLog(client as never, {
      eventKey: "booking_approved", recipients: [{ userId: "req1" }], variables: vars,
    });
    expect(calls.filter((c: DbCallContext) => c.table === "approval_tokens")).toHaveLength(0);
  });

  it("approver ไม่มี line_user_id → ข้าม LINE เงียบ", async () => {
    const { client, calls } = makeClient(lineResponder({ lineUserId: null }));
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    expect(calls.filter((c: DbCallContext) => c.table === "approval_tokens")).toHaveLength(0);
  });

  it("quota ≥500 → ข้าม LINE, log service=internal skipped", async () => {
    const { client, calls } = makeClient(lineResponder({ pushCount: 500 }));
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    expect(calls.filter((c: DbCallContext) => c.table === "approval_tokens")).toHaveLength(0);
    const skip = calls.filter(
      (c: DbCallContext) => c.table === "integration_health" && c.op === "insert" && c.payload?.service === "internal"
    );
    expect(skip).toHaveLength(1);
    expect(skip[0].payload).toMatchObject({ payload: { skipped: "line_quota" } });
  });

  it("quota แตะ 400 (sent=399) ครั้งแรก → ยิง line_quota_warning ให้ admin (in-app)", async () => {
    const { client, calls } = makeClient(lineResponder({ pushCount: 399, warnCount: 0 }));
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    const warnNotif = calls.filter(
      (c: DbCallContext) =>
        c.table === "notifications" && c.op === "insert" && c.payload?.event_key === "line_quota_warning"
    );
    expect(warnNotif).toHaveLength(1);
    expect(warnNotif[0].payload?.user_id).toBe("adm1");
  });

  it("quota แตะ 400 แต่เดือนนี้เตือนไปแล้ว (dedupe) → ไม่ยิงซ้ำ", async () => {
    const { client, calls } = makeClient(lineResponder({ pushCount: 399, warnCount: 1 }));
    await notifyAndLog(client as never, {
      eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
    });
    const warnNotif = calls.filter(
      (c: DbCallContext) =>
        c.table === "notifications" && c.op === "insert" && c.payload?.event_key === "line_quota_warning"
    );
    expect(warnNotif).toHaveLength(0);
  });

  it("never-throw: ทุก query ใน LINE path พังก็ไม่ throw", async () => {
    const { client } = makeClient((ctx) => {
      if (ctx.table === "system_config") return { data: { line_enabled: true } };
      throw new Error("db down");
    });
    await expect(
      notifyAndLog(client as never, {
        eventKey: "booking_submitted", recipients: [{ userId: "adm1" }], variables: vars, lineApproval,
      })
    ).resolves.toBeUndefined();
  });
});

describe("calendar_sync_failed event (registry)", () => {
  it("buildNotification มี default title/body/link", () => {
    const n = buildNotification("calendar_sync_failed", {
      ref_id: "BK-2026-0042",
      room: "ห้องประชุมชั้น 2",
      date: "25 ก.ค. 69",
      action: "สร้าง",
    });
    expect(n.title).toBe("⚠️ ซิงก์ปฏิทินไม่สำเร็จ");
    expect(n.body).toContain("BK-2026-0042");
    expect(n.body).toContain("สร้าง");
    expect(n.link).toBe("/dashboard/integrations");
  });

  it("Discord template แทนค่าครบทุก placeholder (ไม่มี {..} ค้าง)", () => {
    const msg = buildDiscordMessage("calendar_sync_failed", {
      ref_id: "BK-2026-0042",
      room: "ห้องประชุมชั้น 2",
      date: "25 ก.ค. 69",
      action: "สร้าง",
    });
    expect(msg).toContain("BK-2026-0042");
    expect(msg).toContain("ห้องประชุมชั้น 2");
    expect(msg).toContain("สร้าง");
    // จับ placeholder ที่สะกดผิด/ไม่ตรงตัวแปร (เช่น {actions}) — ต้องไม่มี {..} หลงเหลือ
    expect(msg).not.toMatch(/\{[a-z_]+\}/);
  });
});

describe("make_quota_warning event (registry)", () => {
  const vars = { used: "820", limit: "1000", percent: "82" };

  it("buildNotification มี default title/body/link", () => {
    const n = buildNotification("make_quota_warning", vars);
    expect(n.title).toBe("⚠️ โควตา Make.com ใกล้เต็ม");
    expect(n.body).toBe(
      "เดือนนี้ใช้ไปแล้ว 820/1000 operations (82%) เมื่อครบโควตาการซิงก์ปฏิทินจะหยุดจนถึงรอบถัดไป"
    );
    expect(n.link).toBe("/dashboard/integrations");
  });

  it("Discord template แทนค่าครบ ไม่มี {..} ค้าง", () => {
    const msg = buildDiscordMessage("make_quota_warning", vars);
    expect(msg).toContain("820/1000");
    expect(msg).toContain("82%");
    expect(msg).not.toMatch(/\{[a-z_]+\}/);
  });
});
