# Track B — Approval Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างกลไกอนุมัติจริงตาม Global Approval Chain — โมดูลกลาง `processApproval()`, Edge Function `approve-booking`, และหน้า `/approver` + `/approver/history`

**Architecture:** `processApproval()` เป็นโมดูลกลางที่ `approve-booking` เรียกใช้ (และในอนาคต `line-webhook` จะเรียกใช้ตัวเดียวกัน) ใช้ `UNIQUE(booking_id, step)` ของ `approval_logs` เป็นกลไกกัน race condition โดยไม่แตะ `approval_tokens` เลยในรอบนี้ ฝั่ง frontend หน้า `/approver` query `system_config` + `bookings` ตรงจาก client (RLS อนุญาต approver/admin อยู่แล้ว)

**Tech Stack:** Next.js 16 (App Router, client component), Supabase Edge Functions (Deno), Supabase JS client, Tailwind v4 (design tokens)

## Global Constraints

- Approval logic ต้องอยู่ใน `processApproval()` เท่านั้น ห้ามเขียนซ้ำที่อื่น (CLAUDE.md กฎข้อ 2) — `approve-booking/index.ts` ต้องเรียก `processApproval()` ไม่ใช่ implement logic เอง
- ห้ามสร้างหรือแตะ `approval_tokens` table เลยใน plan นี้ (เก็บไว้ให้ LINE track ในอนาคต)
- กลไกกัน race condition คือ `UNIQUE(booking_id, step)` ของ `approval_logs` — จับ error code `23505` แล้วแปลงเป็น `ConflictError`
- ปฏิเสธที่ step ไหนก็ตาม จบ chain ทันที (`final_status='rejected'`) ไม่แตะ `current_step`
- Edge Function ทุกตัวห่อด้วย `withErrorHandling()` throw `AppError` subclass เท่านั้น
- ข้อความ UI และ error ทั้งหมดเป็นภาษาไทยทางการ ใช้ design token เท่านั้น ห้าม hardcode สี
- **ไม่มี Deno CLI/Supabase CLI/Supabase MCP ในเซสชันนี้** — ไฟล์ Deno (`processApproval.ts`, `approve-booking/index.ts`) verify ด้วย manual code review เท่านั้น เหมือน Track A
- **`processApproval.ts` ใช้ type `SupabaseClient` จาก `npm:@supabase/supabase-js@2` ตรงๆ** (ต่างจากที่ระบุไว้ในสเปคเดิมว่าจะเลี่ยง dependency แบบ `logIntegration()`) — เหตุผล: สเปคเขียนขึ้นก่อนพบว่า `supabase/functions` จะถูก exclude ออกจาก root tsc อยู่แล้ว (Task 1) ทำให้เหตุผลเดิมที่ต้องเลี่ยง dependency (เพื่อให้ผ่าน root tsc) ไม่มีผลอีกต่อไป — การเขียน structural interface เองสำหรับ query ที่ซับซ้อนกว่า `logIntegration()` มาก (ต้อง select+eq+single, insert, update+eq) จะเสี่ยงผิดพลาดมากกว่าใช้ type จริงจาก SDK

---

## File Structure

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `tsconfig.json` | แก้ไข | exclude `supabase/functions` (worktree นี้ยังไม่มี fix นี้ — คนละ branch กับ Track A) |
| `supabase/functions/_shared/processApproval.ts` | สร้างใหม่ | โมดูลกลาง approval logic |
| `supabase/functions/approve-booking/index.ts` | สร้างใหม่ | Edge Function รับคำขออนุมัติจากเว็บ |
| `app/(app)/approver/page.tsx` | สร้างใหม่ | คิวรออนุมัติ + confirm dialog |
| `app/(app)/approver/history/page.tsx` | สร้างใหม่ | ประวัติการอนุมัติของตัวเอง |

---

### Task 1: แก้ tsconfig.json ให้ exclude Edge Functions

**เหตุผล:** worktree นี้ fork จาก `main` (commit 76a582c) ซึ่งยังไม่มีการ exclude `supabase/functions` ออกจาก root tsc — fix นี้ถูกทำไปแล้วเฉพาะใน branch ของ Track A (`worktree-track-a-booking`) ซึ่งเป็นคนละ branch คนละ worktree ไม่ share การเปลี่ยนแปลงกัน ต้องทำ fix เดียวกันซ้ำที่นี่ก่อนสร้างไฟล์ Deno entrypoint ใหม่

**Files:**
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: ไม่มี
- Produces: root `npx tsc --noEmit` ไม่ตรวจไฟล์ใต้ `supabase/functions/` อีกต่อไป

- [ ] **Step 1: อ่าน tsconfig.json ปัจจุบันก่อนแก้**

- [ ] **Step 2: เพิ่ม `supabase/functions` เข้า `exclude`**

แก้ field `"exclude"` จาก:
```json
  "exclude": ["node_modules"]
```
เป็น:
```json
  "exclude": ["node_modules", "supabase/functions"]
```

- [ ] **Step 3: ยืนยันว่า root tsc ยังผ่านเหมือนเดิม**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json
git commit -m "chore: exclude supabase/functions from root tsc (Deno syntax incompatible with Node tsconfig)"
```

---

### Task 2: `_shared/processApproval.ts`

**Files:**
- Create: `supabase/functions/_shared/processApproval.ts`

**Interfaces:**
- Consumes: `NotFoundError`, `ConflictError`, `ForbiddenError` จาก `./errors.ts` (มีอยู่แล้วจาก Foundation phase), type `SupabaseClient` จาก `npm:@supabase/supabase-js@2`
- Produces: `processApproval(client: SupabaseClient, params: ProcessApprovalParams): Promise<ApprovalResult>` โดย `ProcessApprovalParams = { bookingId: string; step: number; approverId: string; action: "approved" | "rejected"; note?: string }` และ `ApprovalResult = { bookingId: string; step: number; action: "approved" | "rejected"; currentStep: number; finalStatus: string }` — Task 3 (`approve-booking`) จะ import และเรียกฟังก์ชันนี้

**หมายเหตุ:** ไฟล์นี้ type-check ด้วย `tsc` ไม่ได้ (ดู Global Constraints) — verify ด้วยการอ่านทวนโค้ดอย่างละเอียดแทน

- [ ] **Step 1: สร้างไฟล์**

```typescript
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { NotFoundError, ConflictError, ForbiddenError } from "./errors.ts";

export type ApprovalAction = "approved" | "rejected";

export interface ProcessApprovalParams {
  bookingId: string;
  step: number;
  approverId: string;
  action: ApprovalAction;
  note?: string;
}

export interface ApprovalResult {
  bookingId: string;
  step: number;
  action: ApprovalAction;
  currentStep: number;
  finalStatus: string;
}

export async function processApproval(
  client: SupabaseClient,
  params: ProcessApprovalParams
): Promise<ApprovalResult> {
  const { bookingId, step, approverId, action, note } = params;

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("final_status, current_step")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    throw new NotFoundError("ไม่พบคำขอนี้");
  }

  if (booking.final_status !== "pending") {
    throw new ConflictError("คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว");
  }

  if (booking.current_step !== step - 1) {
    throw new ForbiddenError("ไม่ใช่คิวของท่านในขณะนี้");
  }

  const { error: insertError } = await client.from("approval_logs").insert({
    booking_id: bookingId,
    approver_id: approverId,
    step,
    action,
    note: note ?? null,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      throw new ConflictError("มีการดำเนินการนี้ไปแล้ว");
    }
    throw insertError;
  }

  let currentStep = booking.current_step as number;
  let finalStatus = booking.final_status as string;

  if (action === "rejected") {
    finalStatus = "rejected";
    const { error: updateError } = await client
      .from("bookings")
      .update({ final_status: finalStatus })
      .eq("id", bookingId);
    if (updateError) throw updateError;
  } else if (step < 3) {
    currentStep = step;
    const { error: updateError } = await client
      .from("bookings")
      .update({ current_step: currentStep })
      .eq("id", bookingId);
    if (updateError) throw updateError;
  } else {
    currentStep = 3;
    finalStatus = "approved";
    const { error: updateError } = await client
      .from("bookings")
      .update({ current_step: currentStep, final_status: finalStatus })
      .eq("id", bookingId);
    if (updateError) throw updateError;

    triggerCalendarSync(bookingId);
  }

  return { bookingId, step, action, currentStep, finalStatus };
}

// Extension point: เมื่อ Make.com webhook พร้อมใช้งาน (มี MAKE_WEBHOOK_URL
// secret ตั้งไว้แล้ว) ให้เรียก withRetry() + logIntegration() ที่นี่เพื่อสร้าง
// Google Calendar event — ยังไม่เรียกจริงในตอนนี้ตามที่ตกลงกันไว้
function triggerCalendarSync(_bookingId: string): void {
  // TODO (future track): เรียก Make.com webhook จริง
}
```

- [ ] **Step 2: อ่านทวนโค้ดด้วยตนเอง (manual review แทน type-check)**

ตรวจด้วยตาว่า:
- ลำดับการตรวจ 3 เงื่อนไข (`!booking` → `NotFoundError`, `final_status !== 'pending'` → `ConflictError`, `current_step !== step - 1` → `ForbiddenError`) เรียงก่อนการ insert เสมอ ไม่มีทางข้ามได้
- **ไม่มีการอ้างอิงถึง `approval_tokens` ที่ไหนในไฟล์นี้เลย** (ตรวจตาม Global Constraints)
- `insertError.code === "23505"` คือ error code มาตรฐานของ Postgres สำหรับ unique_violation — ตรงกับ `UNIQUE(booking_id, step)` ที่มีอยู่แล้วใน `007_approval_system.sql`
- แต่ละ branch (`rejected`, `approved && step<3`, `approved && step===3`) อัปเดต `bookings` ถูกคอลัมน์ตามที่สเปคระบุ ไม่มี branch ไหนแตะ `current_step` ตอน reject
- `triggerCalendarSync` เป็น stub เปล่าจริงๆ ไม่มีการเรียก `logIntegration()` หรือ network call ใดๆ ข้างใน

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/processApproval.ts
git commit -m "feat: add processApproval shared module"
```

---

### Task 3: Edge Function `approve-booking`

**Files:**
- Create: `supabase/functions/approve-booking/index.ts`

**Interfaces:**
- Consumes: `withErrorHandling` จาก `../_shared/handler.ts`, `ForbiddenError`/`UnauthorizedError` จาก `../_shared/errors.ts`, `processApproval` + `ApprovalAction` จาก `../_shared/processApproval.ts` (Task 2)
- Produces: HTTP endpoint `POST /functions/v1/approve-booking` รับ `{ booking_id: string, action: "approved" | "rejected", note?: string }` คืน `ApprovalResult` (status 200) เมื่อสำเร็จ

**หมายเหตุ:** เช่นเดียวกับ Task 2 — type-check ด้วย `tsc` ไม่ได้ ใช้ manual review

- [ ] **Step 1: สร้างไฟล์**

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError } from "../_shared/errors.ts";
import {
  processApproval,
  type ApprovalAction,
} from "../_shared/processApproval.ts";

interface ApproveBookingRequest {
  booking_id: string;
  action: ApprovalAction;
  note?: string;
}

Deno.serve(
  withErrorHandling(async (req: Request) => {
    const authHeader = req.headers.get("Authorization") ?? "";

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      throw new UnauthorizedError("ไม่พบข้อมูลผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่");
    }

    const body: ApproveBookingRequest = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("admin_id, approver1_id, approver2_id")
      .single();

    if (configError || !config) {
      throw new ForbiddenError("ไม่พบข้อมูล Approval Chain");
    }

    let step: number;
    if (config.admin_id === user.id) {
      step = 1;
    } else if (config.approver1_id === user.id) {
      step = 2;
    } else if (config.approver2_id === user.id) {
      step = 3;
    } else {
      throw new ForbiddenError("ท่านไม่ได้อยู่ใน Approval Chain");
    }

    const result = await processApproval(adminClient, {
      bookingId: body.booking_id,
      step,
      approverId: user.id,
      action: body.action,
      note: body.note,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: อ่านทวนโค้ดด้วยตนเอง**

ตรวจด้วยตาว่า:
- `authClient` (anon key + forward header) ใช้แค่หา `user.id` เท่านั้น ไม่ใช้ query ข้อมูลอื่น
- `adminClient` (service_role) ใช้ query `system_config` และส่งต่อให้ `processApproval()` — ไม่มีการสร้าง client ตัวที่ 3
- ลำดับการเทียบ `config.admin_id` → `approver1_id` → `approver2_id` ให้ step 1/2/3 ตามลำดับถูกต้องตรงกับสเปค
- ไม่มี branch ไหนข้าม `processApproval()` แล้วแก้ `bookings`/`approval_logs` เอง (ต้องผ่าน `processApproval()` เท่านั้นตาม Global Constraints)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/approve-booking/index.ts
git commit -m "feat: add approve-booking edge function"
```

---

### Task 4: หน้า `/approver` — คิวรออนุมัติ

**Files:**
- Create: `app/(app)/approver/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client` (Foundation phase)
- Produces: route `/approver`

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PendingBooking = {
  id: string;
  ref_id: string;
  title: string;
  activity: string;
  attendees: number;
  start_time: string;
  end_time: string;
  created_at: string;
  room_name: string;
  requester_name: string;
};

export default function ApproverPage() {
  const [myStep, setMyStep] = useState<number | null>(null);
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    booking: PendingBooking;
    action: "approved" | "rejected";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadQueue() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: config, error: configError } = await supabase
      .from("system_config")
      .select("admin_id, approver1_id, approver2_id")
      .single();

    if (configError || !config) {
      setLoadError("ไม่สามารถโหลดข้อมูล Approval Chain ได้");
      setLoading(false);
      return;
    }

    let step: number | null = null;
    if (config.admin_id === user.id) step = 1;
    else if (config.approver1_id === user.id) step = 2;
    else if (config.approver2_id === user.id) step = 3;

    setMyStep(step);

    if (step === null) {
      setBookings([]);
      setLoading(false);
      return;
    }

    const { data, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        "id, ref_id, title, activity, attendees, start_time, end_time, created_at, rooms(name), users(full_name)"
      )
      .eq("final_status", "pending")
      .eq("current_step", step - 1)
      .order("created_at", { ascending: true });

    if (bookingsError) {
      setLoadError("ไม่สามารถโหลดรายการคำขอได้");
      setLoading(false);
      return;
    }

    type Row = {
      id: string;
      ref_id: string;
      title: string;
      activity: string;
      attendees: number;
      start_time: string;
      end_time: string;
      created_at: string;
      rooms: { name: string } | null;
      users: { full_name: string } | null;
    };

    setBookings(
      ((data ?? []) as unknown as Row[]).map((b) => ({
        id: b.id,
        ref_id: b.ref_id,
        title: b.title,
        activity: b.activity,
        attendees: b.attendees,
        start_time: b.start_time,
        end_time: b.end_time,
        created_at: b.created_at,
        room_name: b.rooms?.name ?? "",
        requester_name: b.users?.full_name ?? "",
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadQueue();
  }, []);

  function waitingMinutes(createdAt: string): number {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  }

  async function handleConfirm() {
    if (!confirmTarget) return;

    setSubmitting(true);
    setActionError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setActionError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSubmitting(false);
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/approve-booking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: confirmTarget.booking.id,
          action: confirmTarget.action,
        }),
      }
    );

    const result = await res.json();

    setSubmitting(false);
    setConfirmTarget(null);

    if (!res.ok) {
      setActionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadQueue();
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        คำขออนุมัติ
      </h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && myStep === null && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ท่านไม่ได้อยู่ใน Approval Chain
        </p>
      )}

      {!loading && myStep !== null && bookings.length === 0 && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่มีคำขอรออนุมัติในขณะนี้
        </p>
      )}

      <div className="mt-4 space-y-3">
        {bookings.map((b) => {
          const urgent = waitingMinutes(b.created_at) > 120;
          return (
            <div
              key={b.id}
              className={`rounded-lg border bg-surface-card p-5 ${
                urgent ? "border-warning-border border-[1.5px]" : "border-neutral-200"
              }`}
            >
              <p className="font-medium text-text-primary">{b.title}</p>
              <p className="text-sm text-text-secondary">
                {b.ref_id} — ห้อง {b.room_name} — ผู้จอง {b.requester_name}
              </p>
              <p className="text-sm text-text-secondary">
                ผู้เข้าร่วม {b.attendees} คน
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setConfirmTarget({ booking: b, action: "approved" })
                  }
                  className="rounded-sm bg-success-solid px-4 py-2 text-sm font-medium text-text-on-primary"
                >
                  อนุมัติ
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setConfirmTarget({ booking: b, action: "rejected" })
                  }
                  className="rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
                >
                  ปฏิเสธ
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการ{confirmTarget.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {confirmTarget.booking.title} ({confirmTarget.booking.ref_id})
            </p>
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting}
                className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ, `/approver` ปรากฏใน route list

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/approver/page.tsx"
git commit -m "feat: add approver queue page with confirm dialog"
```

---

### Task 5: หน้า `/approver/history`

**Files:**
- Create: `app/(app)/approver/history/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`
- Produces: route `/approver/history`

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type HistoryEntry = {
  id: string;
  step: number;
  action: "approved" | "rejected";
  note: string | null;
  acted_at: string;
  booking_ref_id: string;
  booking_title: string;
};

export default function ApproverHistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("approval_logs")
        .select("id, step, action, note, acted_at, bookings(ref_id, title)")
        .eq("approver_id", user.id)
        .order("acted_at", { ascending: false });

      if (error) {
        setLoadError("ไม่สามารถโหลดประวัติการทำงานได้");
        setLoading(false);
        return;
      }

      type Row = {
        id: string;
        step: number;
        action: "approved" | "rejected";
        note: string | null;
        acted_at: string;
        bookings: { ref_id: string; title: string } | null;
      };

      setEntries(
        ((data ?? []) as unknown as Row[]).map((r) => ({
          id: r.id,
          step: r.step,
          action: r.action,
          note: r.note,
          acted_at: r.acted_at,
          booking_ref_id: r.bookings?.ref_id ?? "",
          booking_title: r.bookings?.title ?? "",
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการทำงาน
      </h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {!loading && entries.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ยังไม่มีประวัติการทำงาน
        </p>
      )}

      <div className="mt-4 space-y-3">
        {entries.map((e) => (
          <div
            key={e.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">
              {e.booking_title} ({e.booking_ref_id})
            </p>
            <p className="text-sm text-text-secondary">
              ขั้นที่ {e.step} —{" "}
              {e.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"} —{" "}
              {new Date(e.acted_at).toLocaleString("th-TH")}
            </p>
            {e.note && (
              <p className="mt-1 text-sm text-text-secondary">{e.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ, `/approver/history` ปรากฏใน route list

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/approver/history/page.tsx"
git commit -m "feat: add approver history page"
```

---

### Task 6: Manual Verification (แบ่งเป็นส่วนที่ทดสอบได้ตอนนี้ กับส่วนที่รอ deploy)

**Files:** ไม่มี (verification เท่านั้น)

**ส่วนที่ทดสอบได้ตอนนี้ (ไม่ต้องพึ่ง Edge Function):**

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 2: ทดสอบ query คิว — login เป็น admin**

`npm run dev`, login ด้วย `admin@test.local`, เข้า `/approver`
Expected: เห็นเฉพาะ Booking 1 ("ทดสอบ ประชุมคณะกรรมการ", `current_step=0` ตาม seed data) — ไม่เห็น Booking 2/3/4 (สถานะอื่นหรือ step อื่น)

- [ ] **Step 3: ทดสอบ query คิว — login เป็น approver1 (ยังไม่ถึงคิว)**

Login ด้วย `approver1@test.local`, เข้า `/approver`
Expected: ไม่เห็น Booking 1 เลย (เพราะ `current_step=0` ยังไม่ตรงกับที่ approver1 ต้องการ คือ `current_step=1`) — เห็นข้อความ "ไม่มีคำขอรออนุมัติในขณะนี้"

- [ ] **Step 4: ทดสอบ `/approver/history`**

Login ด้วยแต่ละ 4 บัญชี เข้า `/approver/history`
Expected: `admin@test.local` เห็นประวัติจาก seed data (Booking 2, 3, 4 มี `approval_logs` step=1 ที่ทำโดย admin) — `user@test.local` เห็นหน้าว่างเปล่า (ไม่เคยอนุมัติอะไร ไม่มีสิทธิ์เข้าถึงหน้านี้ตาม role ด้วยซ้ำจาก middleware — ตรวจว่า middleware ยัง block ตามที่ Foundation phase ตั้งไว้)

**ส่วนที่ต้อง deploy Edge Function ก่อนถึงจะทดสอบได้จริง:**

- [ ] **Step 5: Deploy Edge Functions**

เซสชันนี้ไม่มี Deno CLI, ไม่มี Supabase CLI, และ Supabase MCP ไม่ได้เชื่อมต่อ — **ต้องให้ผู้ใช้ทำขั้นตอนนี้เอง**:
- Reconnect Supabase MCP แล้วใช้ `deploy_edge_function` กับ `approve-booking` (`verify_jwt=true`)
- หรือติดตั้ง Supabase CLI แล้วรัน `supabase functions deploy approve-booking`

(หมายเหตุ: `processApproval.ts` อยู่ใน `_shared/` ไม่ต้อง deploy แยก — ถูก bundle ไปกับ `approve-booking` อัตโนมัติตอน deploy)

- [ ] **Step 6: ทดสอบอนุมัติจริงตลอด chain (หลัง deploy สำเร็จ)**

Login เป็น `admin@test.local` กดอนุมัติ Booking 1 → ตรวจว่า `current_step` เป็น 1 ใน DB และการ์ดหายจากคิว admin
Login เป็น `approver1@test.local` → เห็น Booking 1 ในคิวแล้ว → กดอนุมัติ → `current_step` เป็น 2
Login เป็น `approver2@test.local` → เห็น Booking 1 → กดอนุมัติ → `current_step` เป็น 3, `final_status` เป็น `approved`

- [ ] **Step 7: ทดสอบกดอนุมัติซ้ำ (race condition guard)**

จำลองด้วยการเรียก `approve-booking` 2 ครั้งติดกันเร็วๆ ด้วย booking+step เดียวกัน (เช่นเปิด 2 แท็บกดพร้อมกัน หรือเรียก fetch 2 ครั้งจาก console)
Expected: ครั้งแรกสำเร็จ ครั้งที่สองได้ `ConflictError` "มีการดำเนินการนี้ไปแล้ว" — ตรวจใน DB ว่า `approval_logs` มีแค่ 1 แถวสำหรับ step นั้น

- [ ] **Step 8: ทดสอบปฏิเสธ**

สร้าง booking ใหม่ (ผ่าน SQL Editor insert ตรง หรือรอ Track A deploy แล้วจองจริง) แล้วให้ admin กดปฏิเสธ
Expected: `final_status` เป็น `rejected` ทันที ไม่มีการเปลี่ยน `current_step`, approver1/approver2 ไม่เห็นคำขอนี้ในคิวของตัวเองเลย

---

## Self-Review Notes

- **Spec coverage:** `processApproval.ts` → Task 2 (ครบทั้ง 7 ข้อของ logic ตามสเปค), `approve-booking` → Task 3, `/approver` → Task 4, `/approver/history` → Task 5, success criteria ทั้ง 8 ข้อในสเปค → Task 6 ครบ (แบ่งทดสอบได้ตอนนี้ 4 ข้อ, รอ deploy 4 ข้อ)
- **Placeholder scan:** ไม่มี TBD/TODO ที่ไม่มีเนื้อหา (comment `// TODO (future track)` ใน `triggerCalendarSync` เป็นการทำเครื่องหมาย extension point ตามที่สเปคต้องการโดยตรง ไม่ใช่งานที่ค้างในแผนนี้)
- **Type consistency:** `ApprovalResult` จาก Task 2 (`processApproval.ts`) ถูกใช้เป็น response shape ตรงๆ ใน Task 3 (`approve-booking`) — field names (`bookingId`, `step`, `action`, `currentStep`, `finalStatus`) สอดคล้องกันทั้งสองไฟล์
- **Deviation from spec noted:** `processApproval.ts` ใช้ `SupabaseClient` type จริงแทนการเขียน structural interface เอง — บันทึกเหตุผลไว้ใน Global Constraints แล้ว (สเปคเขียนก่อนพบว่า `supabase/functions` จะถูก exclude จาก root tsc ทำให้เหตุผลเดิมไม่มีผล)
- **Deno verification gap:** เหมือน Track A — Task 2-3 verify ด้วย manual review เท่านั้น, Task 6 แยกส่วนทดสอบได้ตอนนี้ vs ต้องรอ deploy ไว้ชัดเจน
