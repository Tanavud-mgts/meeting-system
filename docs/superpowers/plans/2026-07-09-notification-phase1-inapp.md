# ระบบแจ้งเตือน เฟส 1 — In-App Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างแจ้งเตือนภายในระบบ (in-app) ที่เกิดขึ้นอัตโนมัติเมื่อมีเหตุการณ์การจอง/อนุมัติ/ยกเลิก แล้วแสดงผ่าน Bell + dropdown บนทุกหน้า พร้อม realtime update

**Architecture:** Orchestrator เป็น shared module ฝั่ง Deno (`_shared/notify.ts`) เรียกจาก Edge Function handler layer (ไม่ใช่ในตัว `processApproval`/`processCancellation` เพื่อไม่ให้ unit test ของ pure function เดิมพัง) — helper `_shared/bookingNotify.ts` resolve ผู้รับ+ตัวแปรจาก `booking_detail` view + `system_config` แล้ว INSERT ลงตาราง `notifications` ด้วย service role (bypass RLS) Frontend อ่านผ่าน RLS + Supabase Realtime

**Tech Stack:** Supabase (PostgreSQL, RLS, Realtime), Deno Edge Functions, Next.js 16 App Router, React 19, Tailwind v4, Vitest

## Global Constraints

- **UI ภาษาไทยทางการ** เหมาะกับหน่วยงานราชการ ทุกข้อความ (CLAUDE.md Rule 9)
- **Design Tokens เท่านั้น** — ใช้ CSS variable / Tailwind token จาก `docs/DESIGN.md` ห้าม hardcode สี/spacing/font (CLAUDE.md Rule 10)
- **Migration ผ่าน `apply_migration` MCP tool เท่านั้น** ตรวจ `list_migrations` ก่อน + `get_advisors(security)` และ `get_advisors(performance)` หลัง migrate (AGENTS.md) — ห้าม `DROP COLUMN`/`DROP TABLE` ตรง (Rule 8)
- **RLS ก่อนเสมอ** — ดู `013_rls_policies.sql` ก่อนเขียน policy ใหม่ (Rule 3)
- **Race condition** — atomic UPDATE พร้อม WHERE เดิมเสมอ (Rule 6) *(ยังไม่มีในเฟส 1 แต่คงหลักการ)*
- **Error Handling** — Edge Function ใหม่ห่อ `withErrorHandling()` + throw `AppError` subclass (Rule 1)
- **ห้ามแก้ `system_config` ผ่าน `execute_sql` ตรง** (AGENTS.md) *(เฟส 1 ไม่แตะ)*
- **PROJECT_ID** = `sbmbdngrutkjugsmmfxa`
- **notifyAndLog ต้องไม่ throw เด็ดขาด** — mutation หลักสำเร็จไปแล้วเสมอ ใช้ `Promise.allSettled()`
- **เฟส 1 = in-app เท่านั้น** — ยังไม่มี WeLPRU/LINE/Discord (secrets, external transport เป็นเฟส 2-3)
- Spec อ้างอิง: `docs/superpowers/specs/2026-07-09-notification-system-design.md`

**หมายเหตุการเบี่ยงจาก spec (จงใจ):** spec เขียนว่าเรียก `notifyAndLog()` "ใน `processApproval()`" แต่ `processApproval.ts`/`processCancellation.ts` มี unit test ที่ `throw` เมื่อเจอ db call ที่ไม่คาดคิด (ดู `mockClient.ts`) การเพิ่ม query แจ้งเตือนเข้าไปจะทำให้ test เดิมพังทั้งชุด จึงย้ายจุดเรียกไป handler layer (`approve-booking/index.ts` ฯลฯ) ซึ่งเป็นที่เดียวกับที่เฟส 2-3 ต้องใช้ context (secrets, recipient resolution) อยู่แล้ว — ผลลัพธ์ business logic ไม่เปลี่ยน

---

## File Structure

**สร้างใหม่:**
- `supabase/migrations/021_notifications.sql` — ตาราง + RLS + realtime + cleanup
- `supabase/functions/_shared/notify.ts` — orchestrator: `applyTemplate`, formatters, `EVENT_DEFAULTS`, `buildNotification`, `notifyAndLog`
- `supabase/functions/_shared/notify.test.ts` — unit tests ของ notify.ts
- `supabase/functions/_shared/bookingNotify.ts` — resolution helpers ต่อเหตุการณ์
- `supabase/functions/_shared/bookingNotify.test.ts` — unit tests ของ bookingNotify.ts
- `lib/notifications/format.ts` — `formatRelativeThai()` (client, pure)
- `lib/notifications/format.test.ts` — unit test
- `hooks/useNotifications.ts` — client hook (fetch + realtime + polling + mutations)
- `components/ui/NotificationBell.tsx` — Bell + dropdown

**แก้ไข:**
- `supabase/functions/create-booking/index.ts` — เรียก `notifyBookingSubmitted`
- `supabase/functions/approve-booking/index.ts` — เรียก `notifyApprovalOutcome`
- `supabase/functions/request-cancellation/index.ts` — เรียก `notifyCancellationRequested`
- `supabase/functions/decide-cancellation/index.ts` — เรียก `notifyCancellationDecision`
- `supabase/functions/direct-cancel-booking/index.ts` — เรียก `notifyBookingCancelledByAdmin`
- `app/(app)/layout.tsx` — render `<NotificationBell />`
- `types/database.ts` — regenerate หลัง migrate (ผ่าน MCP)

---

## Task 1: Migration — ตาราง `notifications` + RLS + Realtime + Cleanup

**Files:**
- Create: `supabase/migrations/021_notifications.sql`

**Interfaces:**
- Produces: ตาราง `notifications(id, user_id, event_key, title, body, link, is_read, created_at, read_at)` — task อื่นทั้งหมดพึ่งชื่อคอลัมน์เหล่านี้

- [ ] **Step 1: เขียนไฟล์ migration**

สร้าง `supabase/migrations/021_notifications.sql`:

```sql
-- ============================================================
-- 021_notifications.sql
-- In-App notifications (เฟส 1 ของระบบแจ้งเตือน)
-- INSERT ทำผ่าน Edge Function (service_role) เท่านั้น — ไม่มี INSERT policy
-- ============================================================

CREATE TABLE notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key  text        NOT NULL,
  title      text        NOT NULL,
  body       text,
  link       text,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  read_at    timestamptz
);

-- ดึง unread ของผู้ใช้เร็ว
CREATE INDEX idx_notifications_unread  ON notifications (user_id) WHERE is_read = false;
-- ดึงรายการล่าสุดของผู้ใช้
CREATE INDEX idx_notifications_user    ON notifications (user_id, created_at DESC);
-- สำหรับ cleanup job
CREATE INDEX idx_notifications_created ON notifications (created_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- อ่าน/แก้/ลบ ได้เฉพาะของตัวเอง (pattern เดียวกับ line_link_tokens / consent_records)
CREATE POLICY "notifications: read own"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications: update own"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications: delete own"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- Realtime: ให้ client subscribe INSERT ได้
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ขยาย cleanup_old_logs: ลบแจ้งเตือนที่อ่านแล้วเก่ากว่า retention เดิม
-- (ใช้ activity_log_retention_months ไม่เพิ่ม config ใหม่ ตาม spec)
-- คง SET search_path = public (hardening migration 016) และ logic เดิมทั้งหมด
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  cfg record;
BEGIN
  SELECT activity_log_retention_months,
         integration_log_retention_months,
         line_token_retention_days
  INTO cfg
  FROM system_config LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM activity_logs
    WHERE created_at < now() - (cfg.activity_log_retention_months || ' months')::interval;

  DELETE FROM integration_health
    WHERE created_at < now() - (cfg.integration_log_retention_months || ' months')::interval;

  DELETE FROM line_link_tokens
    WHERE is_used = true
      AND created_at < now() - (cfg.line_token_retention_days || ' days')::interval;

  DELETE FROM notifications
    WHERE is_read = true
      AND created_at < now() - (cfg.activity_log_retention_months || ' months')::interval;
END;
$$;
```

- [ ] **Step 2: ตรวจ migration ที่รันไปแล้ว**

เรียก MCP `list_migrations` (project_id=`sbmbdngrutkjugsmmfxa`)
Expected: เห็น 001–020, ยังไม่มี 021

- [ ] **Step 3: รัน migration**

เรียก MCP `apply_migration` ชื่อ `021_notifications` ด้วยเนื้อหาจาก Step 1
Expected: สำเร็จ ไม่มี error

- [ ] **Step 4: ตรวจ advisors**

เรียก MCP `get_advisors(type="security")` แล้ว `get_advisors(type="performance")`
Expected: ไม่มี warning ใหม่เกี่ยวกับ `notifications` (RLS enabled แล้ว, policies ครบ) — ถ้ามี ให้แก้ก่อนไปต่อ

- [ ] **Step 5: verify ตาราง + realtime**

เรียก MCP `execute_sql`:
```sql
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
```
Expected: คืน 1 แถว (`notifications` อยู่ใน publication แล้ว)

- [ ] **Step 6: regenerate types**

เรียก MCP `generate_typescript_types` → เขียนทับ `types/database.ts`
Expected: มี type ของ `notifications` ปรากฏ

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/021_notifications.sql types/database.ts
git commit -m "feat(db): notifications table + RLS + realtime + cleanup (notif phase 1)"
```

---

## Task 2: `notify.ts` — Template engine + formatters + event registry

**Files:**
- Create: `supabase/functions/_shared/notify.ts`
- Test: `supabase/functions/_shared/notify.test.ts`

**Interfaces:**
- Produces:
  - `applyTemplate(template: string, vars?: Record<string,string>): string`
  - `formatThaiDate(iso: string): string` → เช่น `"15 ก.ค. 69"`
  - `formatThaiTimeRange(startIso: string, endIso: string): string` → เช่น `"09:00–12:00 น."`
  - `type EventKey` (8 ค่า)
  - `buildNotification(eventKey: EventKey, vars: Record<string,string>): { title: string; body: string; link: string }`

- [ ] **Step 1: เขียน failing test**

สร้าง `supabase/functions/_shared/notify.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  applyTemplate,
  formatThaiDate,
  formatThaiTimeRange,
  buildNotification,
} from "./notify.ts";

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
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- notify`
Expected: FAIL — "Cannot find module './notify.ts'" หรือ export ไม่พบ

- [ ] **Step 3: เขียน implementation**

สร้าง `supabase/functions/_shared/notify.ts`:

```typescript
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// ── Template ──────────────────────────────────────────────
export function applyTemplate(
  template: string,
  vars?: Record<string, string>
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? vars[key] : `{${key}}`
  );
}

// ── Thai date/time formatters (Asia/Bangkok, เลขอารบิก) ────
const TZ = "Asia/Bangkok";

export function formatThaiDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(new Date(iso));
}

function formatThaiTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function formatThaiTimeRange(startIso: string, endIso: string): string {
  return `${formatThaiTime(startIso)}–${formatThaiTime(endIso)} น.`;
}

// ── Event registry ────────────────────────────────────────
export type EventKey =
  | "booking_submitted"
  | "booking_step_approved"
  | "booking_approved"
  | "booking_rejected"
  | "cancellation_requested"
  | "cancellation_approved"
  | "cancellation_denied"
  | "booking_cancelled";

interface EventDefault {
  title: string;
  body: string;
  link: string;
}

const EVENT_DEFAULTS: Record<EventKey, EventDefault> = {
  booking_submitted: {
    title: "🔔 มีคำขอจองห้องประชุมใหม่",
    body: "{booker} ขอจอง{room} วันที่ {date} เวลา {time} โปรดพิจารณาอนุมัติ",
    link: "/approver",
  },
  booking_step_approved: {
    title: "🔔 มีคำขอจองรอท่านพิจารณา",
    body: "{booker} ขอจอง{room} วันที่ {date} เวลา {time} ผ่านการอนุมัติขั้นก่อนหน้าแล้ว",
    link: "/approver",
  },
  booking_approved: {
    title: "✅ การจองได้รับอนุมัติแล้ว",
    body: "การจอง{room} วันที่ {date} เวลา {time} ได้รับอนุมัติเรียบร้อยแล้ว",
    link: "/profile/bookings",
  },
  booking_rejected: {
    title: "❌ การจองไม่ได้รับอนุมัติ",
    body: "การจอง{room} วันที่ {date} ไม่ได้รับอนุมัติ เหตุผล: {reason}",
    link: "/profile/bookings",
  },
  cancellation_requested: {
    title: "🔔 มีคำขอยกเลิกการจอง",
    body: "{booker} ขอยกเลิกการจอง{room} วันที่ {date} เหตุผล: {reason}",
    link: "/approver/cancel-requests",
  },
  cancellation_approved: {
    title: "✅ คำขอยกเลิกได้รับอนุมัติ",
    body: "การจอง{room} วันที่ {date} ถูกยกเลิกเรียบร้อยแล้ว",
    link: "/profile/bookings",
  },
  cancellation_denied: {
    title: "❌ คำขอยกเลิกไม่ได้รับอนุมัติ",
    body: "การจอง{room} วันที่ {date} ยังมีผลตามเดิม เหตุผล: {reason}",
    link: "/profile/bookings",
  },
  booking_cancelled: {
    title: "⚠️ การจองของท่านถูกยกเลิก",
    body: "การจอง{room} วันที่ {date} เวลา {time} ถูกยกเลิก เหตุผล: {reason}",
    link: "/profile/bookings",
  },
};

export function buildNotification(
  eventKey: EventKey,
  vars: Record<string, string>
): { title: string; body: string; link: string } {
  const def = EVENT_DEFAULTS[eventKey];
  return {
    title: applyTemplate(def.title, vars),
    body: applyTemplate(def.body, vars),
    link: def.link,
  };
}

// notifyAndLog + NotifyParams เติมใน Task 3 (append ต่อท้ายไฟล์นี้)
```

> ไฟล์จบตรงนี้ใน Task 2 — เป็น module ที่ valid อยู่แล้ว (มี named export) Task 3 จะ **append** ต่อท้าย ไม่ต้องมี placeholder

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- notify`
Expected: PASS ทุก case

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/notify.ts supabase/functions/_shared/notify.test.ts
git commit -m "feat(notify): template engine + Thai formatters + event registry"
```

---

## Task 3: `notifyAndLog()` — insert in-app notifications

**Files:**
- Modify: `supabase/functions/_shared/notify.ts` (แทนที่บรรทัด `export {}` placeholder)
- Test: `supabase/functions/_shared/notify.test.ts` (เพิ่ม describe block)

**Interfaces:**
- Consumes: `buildNotification`, `EventKey` (Task 2), `makeClient` (mockClient.ts เดิม)
- Produces:
  - `interface NotifyRecipient { userId: string }`
  - `interface NotifyParams { eventKey: EventKey; recipients: NotifyRecipient[]; variables: Record<string,string> }`
  - `notifyAndLog(client: SupabaseClient, params: NotifyParams): Promise<void>` — INSERT 1 แถวต่อผู้รับลง `notifications`, ใช้ `Promise.allSettled`, **ไม่ throw เด็ดขาด**

- [ ] **Step 1: เขียน failing test** (เพิ่มต่อท้าย `notify.test.ts`)

```typescript
import { notifyAndLog } from "./notify.ts";
import { makeClient, type DbCallContext } from "./mockClient.ts";

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
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- notify`
Expected: FAIL — `notifyAndLog` ไม่ถูก export

- [ ] **Step 3: implement** — append ต่อท้าย `notify.ts`:

```typescript
export interface NotifyRecipient {
  userId: string;
}

export interface NotifyParams {
  eventKey: EventKey;
  recipients: NotifyRecipient[];
  variables: Record<string, string>;
}

// ★ Fire-and-Forget: insert แจ้งเตือน in-app รายผู้รับ ไม่ throw เด็ดขาด
export async function notifyAndLog(
  client: SupabaseClient,
  params: NotifyParams
): Promise<void> {
  const { title, body, link } = buildNotification(params.eventKey, params.variables);

  const tasks = params.recipients.map((r) =>
    client.from("notifications").insert({
      user_id: r.userId,
      event_key: params.eventKey,
      title,
      body,
      link,
    })
  );

  const results = await Promise.allSettled(tasks);
  results.forEach((res, i) => {
    if (res.status === "rejected") {
      console.error(`[notifyAndLog] insert ล้มเหลว (recipient ${i}):`, res.reason);
    } else if (res.value && (res.value as { error?: unknown }).error) {
      console.error(
        `[notifyAndLog] insert error (recipient ${i}):`,
        (res.value as { error?: unknown }).error
      );
    }
  });
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- notify`
Expected: PASS ทุก case (รวม Task 2)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/notify.ts supabase/functions/_shared/notify.test.ts
git commit -m "feat(notify): notifyAndLog in-app insert (fire-and-forget, never throws)"
```

---

## Task 4: `bookingNotify.ts` — resolution helpers ต่อเหตุการณ์

**Files:**
- Create: `supabase/functions/_shared/bookingNotify.ts`
- Test: `supabase/functions/_shared/bookingNotify.test.ts`

**Interfaces:**
- Consumes: `notifyAndLog`, `formatThaiDate`, `formatThaiTimeRange` (Task 2-3); `ApprovalResult` จาก `processApproval.ts`; `makeClient` (mockClient)
- Produces (ทุกฟังก์ชันไม่ throw — ห่อ try/catch ภายใน):
  - `notifyBookingSubmitted(client, bookingId: string): Promise<void>`
  - `notifyApprovalOutcome(client, bookingId: string, result: ApprovalResult, note?: string): Promise<void>`
  - `notifyCancellationRequested(client, bookingId: string, reason: string): Promise<void>`
  - `notifyCancellationDecision(client, bookingId: string, decision: "approve" | "reject"): Promise<void>`
  - `notifyBookingCancelledByAdmin(client, bookingId: string, reason: string): Promise<void>`

- [ ] **Step 1: เขียน failing test**

สร้าง `supabase/functions/_shared/bookingNotify.test.ts`:

```typescript
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
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- bookingNotify`
Expected: FAIL — module ไม่พบ

- [ ] **Step 3: implement**

สร้าง `supabase/functions/_shared/bookingNotify.ts`:

```typescript
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ApprovalResult } from "./processApproval.ts";
import { notifyAndLog, formatThaiDate, formatThaiTimeRange } from "./notify.ts";

// step number → ฟิลด์ผู้อนุมัติใน system_config
const STEP_FIELD: Record<number, "admin_id" | "approver1_id" | "approver2_id"> = {
  1: "admin_id",
  2: "approver1_id",
  3: "approver2_id",
};

interface BookingDetailRow {
  requester_id: string;
  requester_name: string;
  room_name: string;
  start_time: string;
  end_time: string;
  cancellation_reason: string | null;
}

interface ChainRow {
  admin_id: string | null;
  approver1_id: string | null;
  approver2_id: string | null;
}

async function loadDetail(
  client: SupabaseClient,
  bookingId: string
): Promise<BookingDetailRow | null> {
  const { data, error } = await client
    .from("booking_detail")
    .select("requester_id, requester_name, room_name, start_time, end_time, cancellation_reason")
    .eq("id", bookingId)
    .single();
  if (error || !data) return null;
  return data as BookingDetailRow;
}

async function loadChain(client: SupabaseClient): Promise<ChainRow | null> {
  const { data, error } = await client
    .from("system_config")
    .select("admin_id, approver1_id, approver2_id")
    .single();
  if (error || !data) return null;
  return data as ChainRow;
}

// ตัวแปรพื้นฐานจาก booking_detail (booker/room/date/time)
function baseVars(d: BookingDetailRow): Record<string, string> {
  return {
    booker: d.requester_name,
    room: d.room_name,
    date: formatThaiDate(d.start_time),
    time: formatThaiTimeRange(d.start_time, d.end_time),
  };
}

export async function notifyBookingSubmitted(
  client: SupabaseClient,
  bookingId: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    const chain = await loadChain(client);
    if (!d || !chain?.admin_id) return;
    await notifyAndLog(client, {
      eventKey: "booking_submitted",
      recipients: [{ userId: chain.admin_id }],
      variables: baseVars(d),
    });
  } catch (err) {
    console.error("[notifyBookingSubmitted]", err);
  }
}

export async function notifyApprovalOutcome(
  client: SupabaseClient,
  bookingId: string,
  result: ApprovalResult,
  note?: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    const base = baseVars(d);

    if (result.action === "rejected") {
      await notifyAndLog(client, {
        eventKey: "booking_rejected",
        recipients: [{ userId: d.requester_id }],
        variables: { ...base, reason: (note ?? "").trim() || "ไม่ระบุ" },
      });
      return;
    }

    if (result.finalStatus === "approved") {
      await notifyAndLog(client, {
        eventKey: "booking_approved",
        recipients: [{ userId: d.requester_id }],
        variables: base,
      });
      return;
    }

    // อนุมัติแบบยังไม่จบ chain → แจ้ง approver ขั้นถัดไป
    const chain = await loadChain(client);
    const nextField = STEP_FIELD[result.currentStep + 1];
    const nextApprover = nextField ? chain?.[nextField] : null;
    if (nextApprover) {
      await notifyAndLog(client, {
        eventKey: "booking_step_approved",
        recipients: [{ userId: nextApprover }],
        variables: base,
      });
    }
  } catch (err) {
    console.error("[notifyApprovalOutcome]", err);
  }
}

export async function notifyCancellationRequested(
  client: SupabaseClient,
  bookingId: string,
  reason: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    const chain = await loadChain(client);
    if (!d || !chain?.admin_id) return;
    await notifyAndLog(client, {
      eventKey: "cancellation_requested",
      recipients: [{ userId: chain.admin_id }],
      variables: { ...baseVars(d), reason: reason.trim() || "ไม่ระบุ" },
    });
  } catch (err) {
    console.error("[notifyCancellationRequested]", err);
  }
}

export async function notifyCancellationDecision(
  client: SupabaseClient,
  bookingId: string,
  decision: "approve" | "reject"
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    if (decision === "approve") {
      await notifyAndLog(client, {
        eventKey: "cancellation_approved",
        recipients: [{ userId: d.requester_id }],
        variables: baseVars(d),
      });
    } else {
      await notifyAndLog(client, {
        eventKey: "cancellation_denied",
        recipients: [{ userId: d.requester_id }],
        variables: { ...baseVars(d), reason: (d.cancellation_reason ?? "").trim() || "ไม่ระบุ" },
      });
    }
  } catch (err) {
    console.error("[notifyCancellationDecision]", err);
  }
}

export async function notifyBookingCancelledByAdmin(
  client: SupabaseClient,
  bookingId: string,
  reason: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    await notifyAndLog(client, {
      eventKey: "booking_cancelled",
      recipients: [{ userId: d.requester_id }],
      variables: { ...baseVars(d), reason: reason.trim() || "ไม่ระบุ" },
    });
  } catch (err) {
    console.error("[notifyBookingCancelledByAdmin]", err);
  }
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- bookingNotify`
Expected: PASS ทุก case

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/bookingNotify.ts supabase/functions/_shared/bookingNotify.test.ts
git commit -m "feat(notify): bookingNotify resolution helpers per event"
```

---

## Task 5: Wire helpers เข้า Edge Function handlers + deploy

**Files:**
- Modify: `supabase/functions/create-booking/index.ts`
- Modify: `supabase/functions/approve-booking/index.ts`
- Modify: `supabase/functions/request-cancellation/index.ts`
- Modify: `supabase/functions/decide-cancellation/index.ts`
- Modify: `supabase/functions/direct-cancel-booking/index.ts`

**Interfaces:**
- Consumes: ฟังก์ชันทั้ง 5 จาก `bookingNotify.ts` (Task 4)

- [ ] **Step 1: create-booking** — เพิ่ม import ใต้ import เดิม แล้วเรียกก่อน `return`:

import (ต่อท้าย import block บนสุด):
```typescript
import { notifyBookingSubmitted } from "../_shared/bookingNotify.ts";
```
ก่อน `return new Response(JSON.stringify(booking), {` (บรรทัด ~77) แทรก:
```typescript
    await notifyBookingSubmitted(adminClient, booking.id);
```

- [ ] **Step 2: approve-booking** — import:
```typescript
import { notifyApprovalOutcome } from "../_shared/bookingNotify.ts";
```
ก่อน `return new Response(JSON.stringify(result), {` (บรรทัด ~68) แทรก:
```typescript
    await notifyApprovalOutcome(adminClient, body.booking_id, result, body.note);
```

- [ ] **Step 3: request-cancellation** — import:
```typescript
import { notifyCancellationRequested } from "../_shared/bookingNotify.ts";
```
ก่อน `return new Response(JSON.stringify(result), {` (บรรทัด ~42) แทรก (แจ้งเฉพาะกรณีขออนุมัติยกเลิก booking ที่อนุมัติแล้ว — ไม่แจ้งตอน user ยกเลิก pending ของตัวเอง):
```typescript
    if (result.newStatus === "cancel_requested") {
      await notifyCancellationRequested(adminClient, body.booking_id, body.reason);
    }
```

- [ ] **Step 4: decide-cancellation** — import:
```typescript
import { notifyCancellationDecision } from "../_shared/bookingNotify.ts";
```
ก่อน `return new Response(JSON.stringify(result), {` (บรรทัด ~60) แทรก:
```typescript
    await notifyCancellationDecision(adminClient, body.booking_id, body.decision);
```

- [ ] **Step 5: direct-cancel-booking** — import:
```typescript
import { notifyBookingCancelledByAdmin } from "../_shared/bookingNotify.ts";
```
ก่อน `return new Response(` สุดท้าย (บรรทัด ~103) แทรก:
```typescript
    await notifyBookingCancelledByAdmin(adminClient, body.booking_id, body.reason);
```

- [ ] **Step 6: type-check ทั้งชุด**

Run: `npm run test`
Expected: PASS ทั้งหมด (notify + bookingNotify + processApproval + processCancellation เดิมไม่พัง)

- [ ] **Step 7: deploy Edge Functions ที่แก้**

เรียก MCP `deploy_edge_function` ทีละตัว (verify_jwt คงค่าเดิม=true): `create-booking`, `approve-booking`, `request-cancellation`, `decide-cancellation`, `direct-cancel-booking`
Expected: deploy สำเร็จทุกตัว

- [ ] **Step 8: smoke test ผ่าน logs**

เรียก MCP `get_logs(service="edge-function")` หลัง deploy
Expected: ไม่มี boot error / import error จาก `bookingNotify.ts`

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/create-booking/index.ts supabase/functions/approve-booking/index.ts supabase/functions/request-cancellation/index.ts supabase/functions/decide-cancellation/index.ts supabase/functions/direct-cancel-booking/index.ts
git commit -m "feat(notify): wire in-app notifications into booking edge functions"
```

---

## Task 6: `useNotifications` hook + relative-time formatter

**Files:**
- Create: `lib/notifications/format.ts`
- Test: `lib/notifications/format.test.ts`
- Create: `hooks/useNotifications.ts`

**Interfaces:**
- Produces:
  - `formatRelativeThai(iso: string, now?: Date): string`
  - `interface NotificationRow { id: string; event_key: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string }`
  - `useNotifications(): { unreadCount: number; items: NotificationRow[]; loading: boolean; markAsRead(id): Promise<void>; markAllAsRead(): Promise<void>; remove(id): Promise<void> }`

- [ ] **Step 1: เขียน failing test สำหรับ formatter**

สร้าง `lib/notifications/format.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatRelativeThai } from "./format";

const now = new Date("2026-07-15T12:00:00Z");

describe("formatRelativeThai", () => {
  it("น้อยกว่า 1 นาที = เมื่อสักครู่", () => {
    expect(formatRelativeThai("2026-07-15T11:59:40Z", now)).toBe("เมื่อสักครู่");
  });
  it("เป็นนาที", () => {
    expect(formatRelativeThai("2026-07-15T11:45:00Z", now)).toBe("15 นาทีที่แล้ว");
  });
  it("เป็นชั่วโมง", () => {
    expect(formatRelativeThai("2026-07-15T09:00:00Z", now)).toBe("3 ชั่วโมงที่แล้ว");
  });
  it("เป็นวัน", () => {
    expect(formatRelativeThai("2026-07-13T12:00:00Z", now)).toBe("2 วันที่แล้ว");
  });
});
```

- [ ] **Step 2: รัน test ให้ fail**

Run: `npm run test -- format`
Expected: FAIL — module ไม่พบ

- [ ] **Step 3: implement formatter**

สร้าง `lib/notifications/format.ts`:

```typescript
export interface NotificationRow {
  id: string;
  event_key: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function formatRelativeThai(iso: string, now: Date = new Date()): string {
  const diffSec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return "เมื่อสักครู่";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  return `${day} วันที่แล้ว`;
}
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm run test -- format`
Expected: PASS

- [ ] **Step 5: implement hook** (ไม่มี unit test — พึ่ง Supabase Realtime/Auth; ตรวจจริงใน Task 7 ผ่าน preview)

สร้าง `hooks/useNotifications.ts`:

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/notifications/format";

const LIST_LIMIT = 50;
const POLL_MS = 60_000;

export function useNotifications() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    userIdRef.current = user.id;
    const { data } = await supabase
      .from("notifications")
      .select("id, event_key, title, body, link, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    setItems((data ?? []) as NotificationRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    load();

    // Realtime เป็นหลัก
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel("user-notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => load()
        )
        .subscribe();
    })();

    // Polling backup 60 วินาที
    const timer = setInterval(load, POLL_MS);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [load]);

  const markAsRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const supabase = createClient();
    if (!userIdRef.current) return;
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userIdRef.current)
      .eq("is_read", false);
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  const unreadCount = items.filter((n) => !n.is_read).length;

  return { unreadCount, items, loading, markAsRead, markAllAsRead, remove };
}
```

- [ ] **Step 6: type-check**

Run: `npm run test -- format` แล้ว `npm run lint`
Expected: format PASS, lint ไม่มี error ใหม่

- [ ] **Step 7: Commit**

```bash
git add lib/notifications/format.ts lib/notifications/format.test.ts hooks/useNotifications.ts
git commit -m "feat(notify): useNotifications hook + relative-time formatter"
```

---

## Task 7: `NotificationBell` component + integrate ใน layout

**Files:**
- Create: `components/ui/NotificationBell.tsx`
- Modify: `app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `useNotifications` (Task 6), `formatRelativeThai` (Task 6)

**อ่านก่อนเริ่ม:** `docs/DESIGN.md` Section 1 (Color) + Section 4 (Component Patterns) — ใช้ token class เท่านั้น (`text-text-primary`, `bg-surface-card`, `border-neutral-200`, `bg-danger-surface`/`text-danger-text` สำหรับ badge, `shadow-card`/`shadow-raised`, `rounded-sm`/`rounded-lg`/`rounded-pill`) ตามที่ `AppNav.tsx` และ `home/page.tsx` ใช้

- [ ] **Step 1: implement NotificationBell**

สร้าง `components/ui/NotificationBell.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { formatRelativeThai } from "@/lib/notifications/format";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { unreadCount, items, loading, markAsRead, markAllAsRead, remove } =
    useNotifications();

  async function onItemClick(id: string, link: string | null) {
    await markAsRead(id);
    setOpen(false);
    if (link) router.push(link);
  }

  return (
    <div className="fixed right-3 top-3 z-40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="การแจ้งเตือน"
        className="relative flex h-10 w-10 items-center justify-center rounded-sm border border-neutral-200 bg-surface-card"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-pill bg-danger-surface px-1 text-xs font-semibold text-danger-text">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-raised">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
              <span className="text-sm font-semibold text-text-primary">
                การแจ้งเตือน
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-xs text-brand-primary hover:underline"
                >
                  อ่านทั้งหมด
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <p className="px-4 py-6 text-center text-sm text-text-muted">
                  กำลังโหลด...
                </p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-text-muted">
                  ยังไม่มีการแจ้งเตือน
                </p>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-2 border-b border-neutral-100 px-4 py-3 ${
                      n.is_read ? "" : "bg-nav-active-surface"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onItemClick(n.id, n.link)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-text-primary">
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 text-sm text-text-secondary">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-text-muted">
                        {formatRelativeThai(n.created_at)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(n.id)}
                      aria-label="ลบการแจ้งเตือน"
                      className="h-6 w-6 shrink-0 text-text-muted hover:text-text-secondary"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: integrate ใน layout**

แก้ `app/(app)/layout.tsx` — เพิ่ม import และ render `<NotificationBell />` ใน root div:

import (ต่อจาก import AppNav):
```typescript
import NotificationBell from "@/components/ui/NotificationBell";
```
แก้ return ให้แทรก `<NotificationBell />` เป็น element แรกใน root div:
```tsx
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <NotificationBell />
      <AppNav items={sidebarItems} />
      <main className="flex-1 bg-surface-page pt-14 pb-20 md:pt-0 md:pb-0">
        <PageTabs role={role} />
        {children}
      </main>
    </div>
  );
```

- [ ] **Step 3: verify ผ่าน preview**

- ตรวจ `.claude/launch.json` มี config `dev` (`npm run dev`, port 3000); ถ้าไม่มีให้สร้างตาม schema แล้ว `preview_start` ชื่อ `dev`
- login เป็น `approver1@test.local` / `test1234` (จาก seed `014`)
- seed แจ้งเตือนทดสอบผ่าน MCP `execute_sql` (แทน user_id ด้วย id จริงของ approver1 — query `SELECT id FROM users WHERE email='approver1@test.local'` ก่อน):
```sql
INSERT INTO notifications (user_id, event_key, title, body, link)
VALUES ('<APPROVER1_ID>', 'booking_submitted', '🔔 มีคำขอจองห้องประชุมใหม่',
        'สมชาย ขอจองห้องประชุม 1 วันที่ 15 ก.ค. 69 เวลา 09:00–12:00 น. โปรดพิจารณาอนุมัติ', '/approver');
```
- `preview_screenshot` → เห็น badge `1` บน bell
- `preview_click` selector `[aria-label="การแจ้งเตือน"]` → `preview_snapshot` เห็นหัวข้อ + เนื้อหา + "อ่านทั้งหมด"
- คลิกรายการ → `preview_snapshot` ยืนยัน navigate ไป `/approver` และ badge หาย
- `preview_console_logs level=error` → ไม่มี error

- [ ] **Step 4: ตรวจ realtime end-to-end (ถ้า deploy Task 5 แล้ว)**

- เปิดหน้าใน preview ค้างไว้ (login เป็น admin — chain step 1)
- สร้าง booking จริงผ่าน UI ด้วยอีก user (หรือ `execute_sql` insert notification อีกแถว)
- ยืนยัน badge เพิ่มขึ้นเองภายใน ≤2 วินาทีโดยไม่ reload (realtime) — ถ้าไม่ขึ้น ตรวจว่า `notifications` อยู่ใน publication (Task 1 Step 5)

- [ ] **Step 5: Commit**

```bash
git add components/ui/NotificationBell.tsx "app/(app)/layout.tsx"
git commit -m "feat(notify): NotificationBell + integrate into app layout"
```

---

## Self-Review Checklist (ทำหลังลงมือครบ 7 task)

- [ ] ทุกเหตุการณ์ในตารางผู้รับ×ช่องทางของ spec (คอลัมน์ In-App) มี task รองรับ: submitted→T5.1, step_approved/approved/rejected→T5.2, cancellation_requested→T5.3, cancellation_approved/denied→T5.4, booking_cancelled→T5.5 ✓
- [ ] `line_quota_warning` **ไม่อยู่ในเฟส 1** (เป็นเรื่อง LINE เฟส 3) — ถูกต้องตามขอบเขต
- [ ] ชื่อ event_key ตรงกันทุกไฟล์ (notify.ts `EVENT_DEFAULTS` ↔ bookingNotify.ts ↔ test) — 8 ค่า
- [ ] ไม่มี placeholder/TODO ในโค้ดที่ต้องรันจริง
- [ ] `notifyAndLog` + ทุก helper ใน bookingNotify **ไม่ throw** (ห่อ try/catch หรือ allSettled)
- [ ] migration ผ่าน `apply_migration` + `get_advisors` (ไม่ใช่ execute_sql)
- [ ] UI ใช้ token class เท่านั้น ไม่ hardcode สี/spacing

## หมายเหตุส่งต่อเฟสถัดไป

- เฟส 2 (WeLPRU/Discord) จะขยาย `NotifyParams.recipients` ให้มี `staffId`/`lineUserId` และเพิ่ม transport calls ใน `notifyAndLog` — โครง `Promise.allSettled` รองรับอยู่แล้ว
- เฟส 2 ต้อง migration ใหม่ (`welpru_link_tokens`, `users.welpru_verified_at`, `system_config` toggles/templates, ขยาย CHECK ของ `integration_health.service`) — ไม่รวมในเฟส 1
- Template ที่ Admin แก้เอง(`notification_settings`) ยังไม่ถูกอ่านในเฟส 1 — `buildNotification` ใช้ default อย่างเดียว จุดเสียบ override อยู่ที่ `buildNotification` (เพิ่ม param ภายหลังได้)
```
