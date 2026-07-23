# Make.com Google Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เติมเนื้อ Make.com Google Calendar sync ให้กับ extension point ที่เป็น stub อยู่ — สร้าง event เมื่ออนุมัติครบขั้น 3, ลบ event เมื่อยกเลิก booking ที่ approved แล้ว

**Architecture:** shared module `_shared/makeComClient.ts` ยิง webhook ไป Make.com scenario เดียว (Router แยก create/delete), รับ `gcal_event_id` กลับแบบ synchronous response, บันทึกกลับ `bookings`, log ทุกครั้งเข้า `integration_health`, และ **ไม่ throw เด็ดขาด** (ธุรกรรมหลักต้องสำเร็จเสมอ) เมื่อล้มเหลวหลัง retry จะแจ้ง Admin ผ่าน event ใหม่ `calendar_sync_failed`

**Tech Stack:** Deno (Supabase Edge Functions), TypeScript, Vitest, `withRetry()` เดิม, `logIntegration()` เดิม, `notifyAndLog()` เดิม

## Global Constraints

- **Rule 2 (Approval logic):** เรียก calendar sync ผ่าน shared function เดียวเท่านั้น — จุดเรียกทั้ง web และ LINE postback ผ่าน `processApproval()`/`processCancellation()` ซึ่งเรียก `syncCalendar*` ให้แล้ว ห้ามยิง webhook ตรงจากที่อื่น
- **Rule 5 (Integration Logging):** ทุกการเรียก Make.com ต้อง `logIntegration()` เข้า `integration_health` ทั้งสำเร็จและล้มเหลว
- **Rule 7 (Secrets):** `MAKE_WEBHOOK_URL` / `MAKE_WEBHOOK_SECRET` อยู่ใน Supabase Edge Function Secrets เท่านั้น ห้ามอยู่ใน `NEXT_PUBLIC_*` หรือ frontend
- **ไม่ throw เด็ดขาด:** `syncCalendarCreate`/`syncCalendarDelete` ต้องไม่ throw ไม่ว่ากรณีใด (pattern เดียวกับ `notifyAndLog`)
- **Deploy:** แก้ `_shared` ต้อง redeploy **ทุก** Edge Function ที่ import — งานนี้: `approve-booking`, `decide-cancellation`, `direct-cancel-booking`, `request-cancellation`, `create-booking`, `line-webhook`
- **Testing:** transport (fetch + Deno.env) ไม่ unit-test — ทดสอบตอน live (ตามแนว `lineClient.ts`/`discordClient.ts`); logic ของเราทดสอบผ่าน DI seam (พารามิเตอร์ `send`)
- **Naming:** โมดูลชื่อ `makeComClient.ts` (ไม่ใช่ `makeClient.ts` — กันชนกับฟังก์ชัน mock `makeClient` ใน `mockClient.ts`)

---

## File Structure

- **Create:** `supabase/functions/_shared/makeComClient.ts` — payload builders (pure) + response classifier (pure) + transport (fetch+retry) + orchestrator `syncCalendarCreate`/`syncCalendarDelete` (never-throw)
- **Create:** `supabase/functions/_shared/makeComClient.test.ts` — unit tests
- **Modify:** `supabase/functions/_shared/notify.ts` — เพิ่ม event `calendar_sync_failed` ใน registry
- **Modify:** `supabase/functions/_shared/notify.test.ts` — test event ใหม่
- **Modify:** `supabase/functions/_shared/bookingNotify.ts` — เพิ่ม `notifyCalendarSyncFailed()` + ขยาย `loadDetail` ให้มี `ref_id`
- **Modify:** `supabase/functions/_shared/bookingNotify.test.ts` — test ฟังก์ชันใหม่
- **Modify:** `supabase/functions/_shared/processApproval.ts` — แทน stub `triggerCalendarSync`
- **Modify:** `supabase/functions/_shared/processApproval.test.ts` — รองรับ booking_detail read
- **Modify:** `supabase/functions/_shared/processCancellation.ts` — แทน stub `triggerCalendarDelete`
- **Modify:** `supabase/functions/_shared/processCancellation.test.ts` — รองรับ booking_detail read
- **Modify:** `supabase/functions/direct-cancel-booking/index.ts` — แทน stub `triggerCalendarDelete`
- **Modify:** `CLAUDE.md` — อัปเดตขอบเขต Make.com เป็น "calendar เท่านั้น"

---

## Task 1: Pure payload builders + response classifier

สร้างส่วน pure ของ `makeComClient.ts` — สร้าง payload และแปลง HTTP status เป็นผลลัพธ์ (retryable หรือไม่) — ทดสอบได้เต็มโดยไม่แตะ network/env

**Files:**
- Create: `supabase/functions/_shared/makeComClient.ts`
- Test: `supabase/functions/_shared/makeComClient.test.ts`

**Interfaces:**
- Consumes: `RetryableHttpError` จาก `./retry.ts`
- Produces:
  - `interface CreateRow { id: string; ref_id: string; title: string; activity: string | null; attendees: number | null; room_name: string; requester_name: string; start_time: string; end_time: string; }`
  - `interface DeleteRow { id: string; ref_id: string; gcal_event_id: string | null; }`
  - `interface CreatePayload { action: "create"; booking_id: string; ref_id: string; title: string; activity: string; attendees: number; room_name: string; requester_name: string; start_time: string; end_time: string; }`
  - `interface DeletePayload { action: "delete"; booking_id: string; ref_id: string; gcal_event_id: string; }`
  - `buildCreatePayload(row: CreateRow): CreatePayload`
  - `buildDeletePayload(row: DeleteRow): DeletePayload`
  - `classifyMakeResponse(status: number): "ok" | Error`

- [ ] **Step 1: Write the failing test**

สร้าง `supabase/functions/_shared/makeComClient.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/makeComClient.test.ts`
Expected: FAIL — "Failed to resolve import ./makeComClient.ts" / exports not defined

- [ ] **Step 3: Write minimal implementation**

สร้าง `supabase/functions/_shared/makeComClient.ts`:

```typescript
import { RetryableHttpError } from "./retry.ts";

export interface CreateRow {
  id: string;
  ref_id: string;
  title: string;
  activity: string | null;
  attendees: number | null;
  room_name: string;
  requester_name: string;
  start_time: string;
  end_time: string;
}

export interface DeleteRow {
  id: string;
  ref_id: string;
  gcal_event_id: string | null;
}

export interface CreatePayload {
  action: "create";
  booking_id: string;
  ref_id: string;
  title: string;
  activity: string;
  attendees: number;
  room_name: string;
  requester_name: string;
  start_time: string;
  end_time: string;
}

export interface DeletePayload {
  action: "delete";
  booking_id: string;
  ref_id: string;
  gcal_event_id: string;
}

// ── Pure builders — ส่งเฉพาะฟิลด์ที่ใช้แสดง (ไม่มี requester_email) ──
export function buildCreatePayload(row: CreateRow): CreatePayload {
  return {
    action: "create",
    booking_id: row.id,
    ref_id: row.ref_id,
    title: row.title,
    activity: row.activity ?? "",
    attendees: row.attendees ?? 0,
    room_name: row.room_name,
    requester_name: row.requester_name,
    start_time: row.start_time,
    end_time: row.end_time,
  };
}

export function buildDeletePayload(row: DeleteRow): DeletePayload {
  return {
    action: "delete",
    booking_id: row.id,
    ref_id: row.ref_id,
    gcal_event_id: row.gcal_event_id ?? "",
  };
}

// ── Pure classifier — retry เฉพาะ 429/5xx (network error retry เองใน withRetry) ──
export function classifyMakeResponse(status: number): "ok" | Error {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429 || status >= 500) {
    return new RetryableHttpError(`Make webhook retryable: ${status}`);
  }
  return new Error(`Make webhook failed: ${status}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/makeComClient.test.ts`
Expected: PASS (3 describe blocks, ทุก it ผ่าน)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/makeComClient.ts supabase/functions/_shared/makeComClient.test.ts
git commit -m "$(cat <<'EOF'
feat(make-com): add payload builders and response classifier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `calendar_sync_failed` event to notify registry

เพิ่ม event key ใหม่ให้ระบบแจ้งเตือน — Admin จะได้รับเมื่อ calendar sync ล้มเหลว (in-app เสมอ + Discord ตาม toggle)

**Files:**
- Modify: `supabase/functions/_shared/notify.ts`
- Test: `supabase/functions/_shared/notify.test.ts`

**Interfaces:**
- Consumes: (none ใหม่)
- Produces: `EventKey` เพิ่มค่า `"calendar_sync_failed"`; `buildNotification("calendar_sync_failed", { ref_id, room, date, action })` คืน title/body/link

- [ ] **Step 1: Write the failing test**

เพิ่มใน `supabase/functions/_shared/notify.test.ts` (ต่อท้ายไฟล์ ก่อนบรรทัดปิดสุดท้าย):

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/notify.test.ts -t "calendar_sync_failed"`
Expected: FAIL — TypeScript error ว่า `"calendar_sync_failed"` ไม่ใช่ `EventKey` / `EVENT_DEFAULTS` ไม่มี key นี้

- [ ] **Step 3: Write minimal implementation**

ใน `supabase/functions/_shared/notify.ts`:

3a. เพิ่มใน union `EventKey` (ต่อจาก `"line_quota_warning"`):

```typescript
export type EventKey =
  | "booking_submitted"
  | "booking_step_approved"
  | "booking_approved"
  | "booking_rejected"
  | "cancellation_requested"
  | "cancellation_approved"
  | "cancellation_denied"
  | "booking_cancelled"
  | "line_quota_warning"
  | "calendar_sync_failed";
```

3b. เพิ่ม entry ใน `EVENT_DEFAULTS` (ต่อจาก `line_quota_warning`):

```typescript
  calendar_sync_failed: {
    title: "⚠️ ซิงก์ปฏิทินไม่สำเร็จ",
    body: "การจอง [{ref_id}] {room} วันที่ {date} — ซิงก์ปฏิทิน ({action}) ไม่สำเร็จ ระบบบันทึกการจองไว้ถูกต้องแล้ว โปรดตรวจสอบที่หน้าเชื่อมต่อระบบ",
    link: "/dashboard/integrations",
  },
```

3c. เพิ่มใน array `EVENT_KEYS` (ต่อจาก `"line_quota_warning"`):

```typescript
  "calendar_sync_failed",
```

3d. เพิ่ม entry ใน `DISCORD_MESSAGE_TEMPLATES` (ต่อจาก `line_quota_warning`):

```typescript
  calendar_sync_failed: "⚠️ ปฏิทินซิงก์ไม่สำเร็จ ({action}) — [{ref_id}] {room} · {date}",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/notify.test.ts`
Expected: PASS (รวม test เดิมทั้งหมด + `calendar_sync_failed` ใหม่)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/notify.ts supabase/functions/_shared/notify.test.ts
git commit -m "$(cat <<'EOF'
feat(notify): add calendar_sync_failed event to registry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `notifyCalendarSyncFailed` in bookingNotify

เพิ่มฟังก์ชันแจ้ง Admin เมื่อ calendar sync ล้มเหลว — โหลด booking_detail (พร้อม ref_id) + admin_id แล้วเรียก `notifyAndLog`

**Files:**
- Modify: `supabase/functions/_shared/bookingNotify.ts`
- Test: `supabase/functions/_shared/bookingNotify.test.ts`

**Interfaces:**
- Consumes: `notifyAndLog`, `formatThaiDate` จาก `./notify.ts` (import อยู่แล้ว)
- Produces: `notifyCalendarSyncFailed(client: SupabaseClient, bookingId: string, action: "create" | "delete"): Promise<void>` (never-throw)

- [ ] **Step 1: Write the failing test**

เพิ่มใน `supabase/functions/_shared/bookingNotify.test.ts` (ต่อท้ายไฟล์). ตรวจสอบก่อนว่า import มี `notifyCalendarSyncFailed` และ `makeClient`/`DbCallContext`:

```typescript
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
```

ถ้า import ด้านบนของไฟล์ยังไม่มี `notifyCalendarSyncFailed` / `makeClient` / `DbCallContext` ให้เพิ่ม (ตรวจ import เดิมก่อน — `makeClient`/`DbCallContext` มาจาก `./mockClient.ts`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/bookingNotify.test.ts -t "notifyCalendarSyncFailed"`
Expected: FAIL — `notifyCalendarSyncFailed` ไม่ถูก export

- [ ] **Step 3: Write minimal implementation**

ใน `supabase/functions/_shared/bookingNotify.ts`:

3a. เพิ่ม `ref_id` ใน interface `BookingDetailRow`:

```typescript
interface BookingDetailRow {
  ref_id: string;
  requester_id: string;
  requester_name: string;
  room_name: string;
  start_time: string;
  end_time: string;
  cancellation_reason: string | null;
}
```

3b. เพิ่ม `ref_id` ใน select ของ `loadDetail`:

```typescript
    .select("ref_id, requester_id, requester_name, room_name, start_time, end_time, cancellation_reason")
```

3c. เพิ่มฟังก์ชันใหม่ท้ายไฟล์:

```typescript
export async function notifyCalendarSyncFailed(
  client: SupabaseClient,
  bookingId: string,
  action: "create" | "delete"
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    const chain = await loadChain(client);
    if (!d || !chain?.admin_id) return;
    await notifyAndLog(client, {
      eventKey: "calendar_sync_failed",
      recipients: [{ userId: chain.admin_id }],
      variables: {
        ref_id: d.ref_id,
        room: d.room_name,
        date: formatThaiDate(d.start_time),
        action: action === "create" ? "สร้าง" : "ลบ",
      },
    });
  } catch (err) {
    console.error("[notifyCalendarSyncFailed]", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/bookingNotify.test.ts`
Expected: PASS (ทุก test เดิม + ใหม่)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/bookingNotify.ts supabase/functions/_shared/bookingNotify.test.ts
git commit -m "$(cat <<'EOF'
feat(notify): add notifyCalendarSyncFailed for admin alerts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Orchestrators `syncCalendarCreate` / `syncCalendarDelete`

เติมส่วน transport + orchestrator ใน `makeComClient.ts` — โหลดข้อมูล, ยิง webhook (retry), บันทึก event id, log, แจ้งเตือนเมื่อล้มเหลว โดยไม่ throw เด็ดขาด ใช้ DI seam (`send`) ให้ทดสอบ logic ได้โดยไม่ต้องมี Deno/fetch

**Files:**
- Modify: `supabase/functions/_shared/makeComClient.ts`
- Test: `supabase/functions/_shared/makeComClient.test.ts`

**Interfaces:**
- Consumes: `withRetry` จาก `./retry.ts`; `logIntegration` จาก `./integrationLog.ts`; `notifyCalendarSyncFailed` จาก `./bookingNotify.ts`; `buildCreatePayload`/`buildDeletePayload`/`classifyMakeResponse` (Task 1)
- Produces:
  - `type SendFn = (payload: CreatePayload | DeletePayload) => Promise<Record<string, unknown> | null>`
  - `isMakeConfigured(): boolean`
  - `callMakeOrSkip: SendFn`
  - `syncCalendarCreate(client: SupabaseClient, bookingId: string, send?: SendFn): Promise<void>`
  - `syncCalendarDelete(client: SupabaseClient, bookingId: string, send?: SendFn): Promise<void>`

- [ ] **Step 1: Write the failing test**

เพิ่มใน `supabase/functions/_shared/makeComClient.test.ts` (ต่อท้าย). อัปเดต import ให้มี `syncCalendarCreate`, `syncCalendarDelete`, `type SendFn`; เพิ่ม `import { makeClient, type DbCallContext } from "./mockClient.ts";`:

```typescript
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
```

เพิ่ม `isMakeConfigured` ในบรรทัด import จาก `./makeComClient.ts` ด้วย

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/makeComClient.test.ts -t "syncCalendarCreate"`
Expected: FAIL — `syncCalendarCreate` ไม่ถูก export

- [ ] **Step 3: Write minimal implementation**

เพิ่มใน `supabase/functions/_shared/makeComClient.ts`:

3a. เพิ่ม imports ที่หัวไฟล์ (ต่อจาก import `RetryableHttpError`):

```typescript
import { withRetry } from "./retry.ts";
import { logIntegration } from "./integrationLog.ts";
import { notifyCalendarSyncFailed } from "./bookingNotify.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
```

3b. เพิ่มส่วน transport + orchestrator ท้ายไฟล์:

```typescript
// ── Transport (fetch + Deno.env — ทดสอบตอน live ไม่ unit-test) ──
export type SendFn = (
  payload: CreatePayload | DeletePayload
) => Promise<Record<string, unknown> | null>;

// อ่านผ่าน globalThis.Deno เพื่อไม่ throw ใน Node/test env (Deno undefined → false)
export function isMakeConfigured(): boolean {
  try {
    const deno = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno;
    return Boolean(deno?.env.get("MAKE_WEBHOOK_URL"));
  } catch {
    return false;
  }
}

async function postToMake(
  url: string,
  secret: string,
  payload: CreatePayload | DeletePayload
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": secret },
    body: JSON.stringify(payload),
  });
  const outcome = classifyMakeResponse(res.status);
  if (outcome !== "ok") throw outcome;
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ยิงจริงพร้อม retry — คืน null ถ้ายังไม่ตั้งค่า MAKE_WEBHOOK_URL (สวิตช์เปิดใช้งาน)
export const callMakeOrSkip: SendFn = async (payload) => {
  if (!isMakeConfigured()) return null;
  const env = (globalThis as { Deno: { env: { get(k: string): string | undefined } } }).Deno.env;
  const url = env.get("MAKE_WEBHOOK_URL")!;
  const secret = env.get("MAKE_WEBHOOK_SECRET") ?? "";
  return await withRetry(() => postToMake(url, secret, payload), { maxAttempts: 3 });
};

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" ? m : String(e);
}

async function onCalendarFailure(
  client: SupabaseClient,
  bookingId: string,
  action: "create" | "delete",
  detail: string
): Promise<void> {
  await logIntegration(client, {
    service: "make_com",
    status: "failed",
    payload: { action, booking_id: bookingId },
    error_detail: detail,
  });
  await notifyCalendarSyncFailed(client, bookingId, action);
}

// ── Orchestrators — ไม่ throw เด็ดขาด ──
export async function syncCalendarCreate(
  client: SupabaseClient,
  bookingId: string,
  send: SendFn = callMakeOrSkip
): Promise<void> {
  try {
    const { data, error } = await client
      .from("booking_detail")
      .select("id, ref_id, title, activity, attendees, room_name, requester_name, start_time, end_time")
      .eq("id", bookingId)
      .single();
    if (error || !data) return;

    let body: Record<string, unknown> | null;
    try {
      body = await send(buildCreatePayload(data as CreateRow));
    } catch (err) {
      await onCalendarFailure(client, bookingId, "create", errMsg(err));
      return;
    }
    if (body === null) return; // ยังไม่ตั้งค่า Make → ข้ามเงียบ

    const eventId = body.gcal_event_id;
    if (typeof eventId !== "string" || eventId.length === 0) {
      await onCalendarFailure(client, bookingId, "create", "Make response missing gcal_event_id");
      return;
    }

    const { error: updErr } = await client
      .from("bookings")
      .update({ gcal_event_id: eventId })
      .eq("id", bookingId);
    if (updErr) {
      await onCalendarFailure(
        client,
        bookingId,
        "create",
        `booking update failed (orphan event ${eventId}): ${errMsg(updErr)}`
      );
      return;
    }

    await logIntegration(client, {
      service: "make_com",
      status: "success",
      payload: { action: "create", booking_id: bookingId },
    });
  } catch (err) {
    console.error("[syncCalendarCreate]", err);
  }
}

export async function syncCalendarDelete(
  client: SupabaseClient,
  bookingId: string,
  send: SendFn = callMakeOrSkip
): Promise<void> {
  try {
    const { data, error } = await client
      .from("booking_detail")
      .select("id, ref_id, gcal_event_id")
      .eq("id", bookingId)
      .single();
    if (error || !data) return;
    const row = data as DeleteRow;
    if (!row.gcal_event_id) return; // ไม่มี event → ไม่ต้องลบ ไม่เรียก external

    let body: Record<string, unknown> | null;
    try {
      body = await send(buildDeletePayload(row));
    } catch (err) {
      await onCalendarFailure(client, bookingId, "delete", errMsg(err));
      return;
    }
    if (body === null) return;

    await logIntegration(client, {
      service: "make_com",
      status: "success",
      payload: { action: "delete", booking_id: bookingId },
    });
  } catch (err) {
    console.error("[syncCalendarDelete]", err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/makeComClient.test.ts`
Expected: PASS (Task 1 tests + Task 4 tests ทั้งหมด)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/makeComClient.ts supabase/functions/_shared/makeComClient.test.ts
git commit -m "$(cat <<'EOF'
feat(make-com): add never-throw calendar sync orchestrators

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire orchestrators into mutation paths (remove stubs)

แทน stub ทั้ง 3 จุดด้วยการเรียก orchestrator จริง และปรับ test เดิมให้รองรับ booking_detail read

**Files:**
- Modify: `supabase/functions/_shared/processApproval.ts`
- Modify: `supabase/functions/_shared/processApproval.test.ts`
- Modify: `supabase/functions/_shared/processCancellation.ts`
- Modify: `supabase/functions/_shared/processCancellation.test.ts`
- Modify: `supabase/functions/direct-cancel-booking/index.ts`

**Interfaces:**
- Consumes: `syncCalendarCreate`, `syncCalendarDelete` จาก `./makeComClient.ts` (Task 4)
- Produces: (none — internal wiring)

- [ ] **Step 1: Update existing tests to expect the booking_detail read**

1a. ใน `supabase/functions/_shared/processApproval.test.ts` — เพิ่ม branch ใน `responderFor` ก่อนบรรทัด `throw new Error(...)` (บรรทัด 31):

```typescript
    if (ctx.table === "booking_detail" && ctx.op === "select") {
      return { data: null };
    }
```

และในเทสต์ "approves the booking on the final (step 3) approval" (บรรทัด ~98) เพิ่ม assertion ท้าย test เพื่อพิสูจน์ว่า wiring เรียกจริง:

```typescript
    expect(calls.some((c) => c.table === "booking_detail")).toBe(true);
```

1b. ใน `supabase/functions/_shared/processCancellation.test.ts` — ในเทสต์ "approving a cancel request sets the booking to cancelled and logs it" (บรรทัด 124) เพิ่ม branch ในตัว responder ก่อน `throw`:

```typescript
      if (ctx.table === "booking_detail" && ctx.op === "select")
        return { data: { id: "b1", ref_id: "BK-1", gcal_event_id: null } };
```

และเพิ่ม assertion ท้าย test:

```typescript
    expect(calls.some((c) => c.table === "booking_detail")).toBe(true);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/processApproval.test.ts supabase/functions/_shared/processCancellation.test.ts`
Expected: FAIL — assertion `booking_detail` ยังไม่เกิด (เพราะยังไม่ wire) — 2 test ใหม่ fail

- [ ] **Step 3: Wire the orchestrators**

3a. `supabase/functions/_shared/processApproval.ts`:
- เพิ่ม import ใต้ import `errors.ts`:

```typescript
import { syncCalendarCreate } from "./makeComClient.ts";
```

- แทนบรรทัด `triggerCalendarSync(bookingId);` (บรรทัด 96) ด้วย:

```typescript
    await syncCalendarCreate(client, bookingId);
```

- ลบฟังก์ชัน stub `triggerCalendarSync` และคอมเมนต์ "Extension point" ทั้งบล็อก (บรรทัด 102-107)

3b. `supabase/functions/_shared/processCancellation.ts`:
- เพิ่ม import ใต้ import เดิม:

```typescript
import { syncCalendarDelete } from "./makeComClient.ts";
```

- แทนบรรทัด `triggerCalendarDelete(bookingId);` (บรรทัด 161) ด้วย:

```typescript
    await syncCalendarDelete(client, bookingId);
```

- ลบฟังก์ชัน stub `triggerCalendarDelete` และคอมเมนต์ "Extension point" (บรรทัด 191-197)

3c. `supabase/functions/direct-cancel-booking/index.ts`:
- เพิ่ม import ใต้ import เดิมของไฟล์:

```typescript
import { syncCalendarDelete } from "../_shared/makeComClient.ts";
```

- แทนบล็อก (บรรทัด 100-102):

```typescript
    if (booking.gcal_event_id) {
      triggerCalendarDelete(body.booking_id);
    }
```

ด้วย:

```typescript
    if (booking.gcal_event_id) {
      await syncCalendarDelete(adminClient, body.booking_id);
    }
```

- ลบฟังก์ชัน stub `triggerCalendarDelete` และคอมเมนต์ "Extension point" (บรรทัด 116-122)

- [ ] **Step 4: Run the full suite to verify it passes**

Run: `npm run test`
Expected: PASS — ทุกไฟล์ (รวม 157 เดิม + ที่เพิ่ม) ผ่านหมด ไม่มี stub เหลือ

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/processApproval.ts supabase/functions/_shared/processApproval.test.ts supabase/functions/_shared/processCancellation.ts supabase/functions/_shared/processCancellation.test.ts supabase/functions/direct-cancel-booking/index.ts
git commit -m "$(cat <<'EOF'
feat(make-com): wire calendar sync into approval and cancellation paths

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update CLAUDE.md Make.com scope

ปรับเอกสารให้ตรงความจริง — Make.com ทำ Google Calendar อย่างเดียว (Discord ยิงตรงแล้ว)

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: (none)
- Produces: (none — docs only)

- [ ] **Step 1: Update the text**

ใน `CLAUDE.md` แถวตาราง Free Plan Constraints ของ Make.com — เปลี่ยนคอลัมน์ "ผลกระทบต่อโค้ด" จาก:

```
| Make.com | 2 active scenarios, 1,000 credits/เดือน | ใช้ Router module แยก action ภายใน scenario เดียว ไม่สร้าง scenario ใหม่ |
```

เป็น:

```
| Make.com | 2 active scenarios, 1,000 credits/เดือน | Google Calendar เท่านั้น (Discord ยิงตรงจาก Edge Function) — Router แยก create/delete ใน scenario เดียว รับ gcal_event_id กลับทาง webhook response |
```

- [ ] **Step 2: Verify no other stale Make.com references**

Run: `git grep -n "Make.com" CLAUDE.md`
Expected: บรรทัดที่เหลืออ้างถึง Make.com ยังถูกต้อง (สร้าง/ลบ Google Calendar event) ไม่มีที่ไหนบอกว่า Make ทำ Discord

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: clarify Make.com scope is Google Calendar only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Make.com scenario setup + secrets + deploy + live smoke test

งาน ops — ตั้งค่า Make.com scenario, secrets, redeploy edge functions, และทดสอบ end-to-end บน production (ไม่มี unit test — เป็นการยืนยันของจริง)

**Files:** (ไม่มีไฟล์โค้ด — ทำใน Make.com UI + Supabase CLI/MCP)

- [ ] **Step 1: สร้าง Make.com scenario**

ใน Make.com (account ที่เชื่อม Google ของคณะ):
1. **Custom Webhook** module → สร้าง webhook ใหม่ → คัดลอก URL
2. ต่อ **Filter/Router**: module Router → ก่อนแยกแขน ใส่ filter บน route ว่า `x-webhook-secret` header (map จาก `1. Headers: x-webhook-secret`) ต้อง `Equal to` ค่า secret ที่จะสร้างใน Step 3 — ถ้าไม่ตรงให้ route ไป module ที่ตอบ 403 (Webhook Response status 403)
3. **แขน create** (filter `action` = `create`):
   - Google Calendar → **Create an Event**: Calendar = ปฏิทินเป้าหมายของคณะ; Summary = `[{{ref_id}}] {{title}} @ {{room_name}}`; Location = `{{room_name}}`; Description = `ผู้จอง: {{requester_name}}` + newline `กิจกรรม: {{activity}}` + newline `จำนวนผู้เข้าร่วม: {{attendees}} คน` + newline `อ้างอิง: {{ref_id}}`; Start = `{{start_time}}`; End = `{{end_time}}`
   - **Webhook Response**: Status 200, Body (JSON) `{"gcal_event_id": "{{<id จาก Create an Event>}}"}`, Header `Content-Type: application/json`
4. **แขน delete** (filter `action` = `delete`):
   - Google Calendar → **Delete an Event**: Calendar = เดียวกัน; Event ID = `{{gcal_event_id}}`
   - ตั้ง **error handler** บน Delete module: ขวาคลิก → Add error handler → **Resume** (ให้ถือว่าสำเร็จเมื่อ event ไม่พบ/ถูกลบไปแล้ว)
   - **Webhook Response**: Status 200, Body `{"ok": true}`
5. เปิดใช้ scenario (toggle ON) และตั้ง scheduling = Immediately (on webhook)

- [ ] **Step 2: ยืนยัน scenario รับ payload ได้**

ทดสอบจาก Make.com "Run once" + ยิง payload ตัวอย่างด้วย curl (แทนค่า `<URL>` และ `<SECRET>`):

```bash
curl -i -X POST "<URL>" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <SECRET>" \
  -d '{"action":"create","booking_id":"test","ref_id":"BK-TEST","title":"ทดสอบ","activity":"ทดสอบ","attendees":1,"room_name":"ห้องทดสอบ","requester_name":"ทดสอบ","start_time":"2026-08-01T02:00:00Z","end_time":"2026-08-01T03:00:00Z"}'
```

Expected: HTTP 200 + body `{"gcal_event_id":"..."}` และมี event โผล่ในปฏิทิน (ลบ event ทดสอบทิ้งหลังยืนยัน)

- [ ] **Step 3: ตั้ง secrets** (ผู้ใช้รันเอง — Agent ไม่ใส่ค่า credential)

```bash
supabase secrets set MAKE_WEBHOOK_URL=<URL จาก Step 1>
supabase secrets set MAKE_WEBHOOK_SECRET=<SECRET ที่สร้างเอง ตรงกับ filter>
supabase secrets list   # ยืนยันเห็น MAKE_WEBHOOK_URL + MAKE_WEBHOOK_SECRET
```

- [ ] **Step 4: Redeploy edge functions ที่ import _shared ที่แก้**

Deploy ทุกตัวที่ import chain นี้ (ผ่าน `deploy_edge_function` MCP หรือ `supabase functions deploy`):

```
approve-booking, decide-cancellation, direct-cancel-booking,
request-cancellation, create-booking, line-webhook
```

`line-webhook` ต้อง deploy ด้วย `--no-verify-jwt` (verify_jwt=false) เหมือนเดิม
Expected: ทุกตัว ACTIVE, version เพิ่มขึ้น

- [ ] **Step 5: Live smoke test บน production**

1. จองห้องจริง 1 รายการ (test user)
2. อนุมัติครบ 3 ขั้น (Admin → Approver1 → Approver2)
3. ตรวจ: event โผล่ในปฏิทิน Google + query `bookings` ว่ามี `gcal_event_id` (ผ่าน `execute_sql` MCP หรือหน้าเว็บ)
4. ยกเลิก booking นั้น (Admin direct-cancel)
5. ตรวจ: event หายจากปฏิทิน
6. เปิดหน้า `/dashboard/integrations` → การ์ด Make.com เป็น "ปกติ" มี success ≥ 2, failed = 0
7. ตรวจ `get_logs` (edge-function) ไม่มี error ค้าง

- [ ] **Step 6: Merge branch**

หลัง smoke test ผ่านทั้งหมด:

```bash
git checkout main
git merge --no-ff feat/make-com-calendar
git push origin main
```

(หรือเปิด PR ตามที่ผู้ใช้ต้องการ)

---

## Self-Review

**1. Spec coverage:**
- `makeComClient.ts` payload builder + transport + orchestrator → Task 1, 4 ✓
- Sync response รับ `gcal_event_id` → UPDATE bookings → Task 4 ✓
- ไม่ throw เด็ดขาด → Task 4 (never-throw tests) ✓
- log integration_health success/failed → Task 4 ✓
- `calendar_sync_failed` แจ้ง Admin (in-app + Discord) → Task 2, 3 ✓
- ไม่ส่ง requester_email → Task 1 (test ยืนยัน) ✓
- Auth header x-webhook-secret → Task 4 (postToMake) + Task 7 (filter) ✓
- retry 429/5xx, 4xx ไม่ retry → Task 1 (classifyMakeResponse) ✓
- MAKE_WEBHOOK_URL ไม่ตั้ง → ข้ามเงียบ → Task 4 (callMakeOrSkip คืน null) ✓
- ยกเลิกไม่มี gcal_event_id → ข้าม → Task 4 (syncCalendarDelete) ✓
- wire 3 จุด + ลบ stub → Task 5 ✓
- Make scenario + secrets + deploy + smoke → Task 7 ✓
- CLAUDE.md scope → Task 6 ✓

**2. Placeholder scan:** ไม่มี TBD/TODO — โค้ดครบทุก step ✓

**3. Type consistency:** `CreateRow`/`DeleteRow`/`CreatePayload`/`DeletePayload`/`SendFn`/`syncCalendarCreate`/`syncCalendarDelete`/`isMakeConfigured`/`callMakeOrSkip`/`notifyCalendarSyncFailed` ใช้ชื่อตรงกันทุก task ✓ · `calendar_sync_failed` ตรงกันใน notify registry + bookingNotify ✓
