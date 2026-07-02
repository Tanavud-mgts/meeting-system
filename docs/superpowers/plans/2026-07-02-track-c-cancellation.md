# Track C — ยกเลิกการจอง Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างกลไกยกเลิกการจองที่ทำงานได้จริงตามกฎใน CLAUDE.md — User ยกเลิก `pending` ได้ทันที / ขอยกเลิก `approved` ต้องรอ Admin หรือ Approver อนุมัติ — ผ่านหน้า `/profile/bookings` และ `/approver/cancel-requests`

**Architecture:** โมดูลกลาง `processCancellation.ts` export 2 ฟังก์ชัน (`requestCancellation()` ฝั่ง User, `decideCancellation()` ฝั่ง Admin/Approver) เรียกผ่าน 2 Edge Functions (`request-cancellation`, `decide-cancellation`) ที่ใช้ dual-client pattern (anon-key client หา identity, service-role client ทำ query/update จริง) เหมือน Track A/B — Race condition กันด้วย atomic `UPDATE ... WHERE final_status = <ค่าที่คาดไว้>` แล้วเช็คจำนวนแถวที่อัปเดต

**Tech Stack:** Next.js 16 App Router (client component), Supabase Edge Function (Deno), `@supabase/supabase-js@2`

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10) — ใช้ class จาก `docs/DESIGN.md` เท่านั้น (`bg-surface-card`, `text-text-primary`, `bg-danger-surface`, `border-danger-border`, `bg-success-solid`, `bg-brand-primary`, `border-neutral-200`/`300`, `bg-surface-field`, `shadow-modal` ฯลฯ) ห้าม hardcode สี/spacing/font
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9)
- **ทุก Edge Function ห่อด้วย `withErrorHandling()`** จาก `_shared/handler.ts`, throw `AppError` subclass จาก `_shared/errors.ts` เท่านั้น (CLAUDE.md กฎข้อ 1) — ห้ามเขียน try-catch เอง
- **Race condition guard แบบ atomic UPDATE-WHERE เท่านั้น** (CLAUDE.md กฎข้อ 6) — ทุกจุดที่เปลี่ยน `bookings.final_status` ต้อง `UPDATE ... WHERE final_status = <ค่าเดิมที่คาดไว้>` แล้วเช็คว่ามีแถวถูกอัปเดตจริงก่อนไป insert log ห้าม SELECT แล้วค่อย UPDATE แยกกัน
- **`triggerCalendarDelete()` เป็น stub เท่านั้น** — ห้ามเรียก `logIntegration()` ในสถานะปัจจุบัน เพราะยังไม่มีการเรียก external service จริง (การ log "success" ทั้งที่ไม่ได้เรียกอะไรเลยผิดเจตนากฎข้อ 5)
- **`processCancellation.ts` ใช้ `SupabaseClient` type จริงจาก `npm:@supabase/supabase-js@2`** ไม่ใช้ structural interface เอง (เหมือน Track B's `processApproval.ts` — เพราะ `supabase/functions` ถูก exclude จาก root tsc อยู่แล้วหลัง Task 1)
- **Route group directory ต้องเป็น `app/(app)` เป๊ะ** (วงเล็บเปิด-ปิดชิดกัน ไม่มี `/` แทรก) — Track B เคยมีบั๊กที่ implementer สร้างไดเรกทอรีผิดเป็น `app/(app/)` ทำให้ route ใช้งานไม่ได้และหลุด shared layout ตรวจสอบด้วย `ls "app/"` หลังสร้างไฟล์ทุกครั้งว่ามีแค่ไดเรกทอรี `(app)` เดียว
- **`verify_jwt=true` ต้องประกาศใน `supabase/config.toml` แบบ declarative** สำหรับทุก Edge Function ใหม่ (`[functions.request-cancellation]`, `[functions.decide-cancellation]`) — ไม่พึ่งแค่ default หรือ deploy-time flag (บทเรียนจาก Track A/B final review)
- **ต้อง validate ค่า enum ที่มาจาก request body runtime เสมอ** (`decision` ต้องเป็น `'approve'`/`'reject'` เป๊ะ) ไม่พึ่ง TypeScript compile-time type อย่างเดียว (บทเรียนจาก Track B final review)
- **ไม่มี Deno CLI / Supabase CLI / Supabase MCP ในเซสชันนี้** — Edge Function `.ts` verify ด้วย manual code review + `npx tsc --noEmit`/`npm run build` (เฉพาะไฟล์ frontend) เท่านั้น ไม่สามารถรัน/deploy Edge Function จริงได้ในเซสชันนี้
- **`role` ที่บันทึกใน `cancellation_logs`** ต้องตรงกับ CHECK constraint `IN ('user','approver','admin')` — `requestCancellation()` เขียน `'user'` เสมอ (ไม่ว่าบัญชีจริงจะมี system role อะไรก็ตาม เพราะบริบทคือ "เจ้าของ booking ยกเลิกของตัวเอง"), `decideCancellation()` เขียน role จริงของผู้ตัดสินใจ (`'admin'`/`'approver'`)

## File Structure

| File | หน้าที่ |
|---|---|
| `tsconfig.json` | เพิ่ม `"supabase/functions"` เข้า exclude |
| `supabase/functions/_shared/processCancellation.ts` | โมดูลกลาง — `requestCancellation()`, `decideCancellation()`, stub `triggerCalendarDelete()` |
| `supabase/functions/request-cancellation/index.ts` | Edge Function รับคำขอยกเลิกจาก User |
| `supabase/functions/decide-cancellation/index.ts` | Edge Function รับการตัดสินใจจาก Admin/Approver |
| `supabase/config.toml` | เพิ่ม `[functions.request-cancellation]`, `[functions.decide-cancellation]` พร้อม `verify_jwt=true` |
| `app/(app)/profile/bookings/page.tsx` | หน้าประวัติการจองของ User + ปุ่มยกเลิก/ขอยกเลิก |
| `app/(app)/approver/cancel-requests/page.tsx` | หน้าคิวคำขอยกเลิกของ Admin/Approver |

---

### Task 1: Exclude `supabase/functions` จาก root tsc

**Files:**
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `npx tsc --noEmit` ที่ root ไม่พยายาม type-check ไฟล์ Deno ใน `supabase/functions/` อีกต่อไป

- [ ] **Step 1: แก้ tsconfig.json**

เปิด `tsconfig.json` หา key `"exclude"` (ปัจจุบันคือ `"exclude": ["node_modules"]`) แก้เป็น:

```json
"exclude": ["node_modules", "supabase/functions"]
```

- [ ] **Step 2: ตรวจว่า type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: exit code 0 ไม่มี error จากไฟล์ใน `supabase/functions/`

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: exclude supabase/functions from root tsc (Deno syntax incompatible with Node tsconfig)"
```

---

### Task 2: `processCancellation.ts` โมดูลกลาง

**Files:**
- Create: `supabase/functions/_shared/processCancellation.ts`

**Interfaces:**
- Consumes: `AppError` subclasses จาก `../_shared/errors.ts` (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`) — ไฟล์เหล่านี้มีอยู่แล้วจาก Foundation phase
- Produces:
  - `requestCancellation(client: SupabaseClient, params: RequestCancellationParams): Promise<RequestCancellationResult>`
  - `decideCancellation(client: SupabaseClient, params: DecideCancellationParams): Promise<DecideCancellationResult>`
  - Types: `CancellationRole`, `CancellationDecision`, `RequestCancellationParams`, `RequestCancellationResult`, `DecideCancellationParams`, `DecideCancellationResult`

- [ ] **Step 1: สร้างไฟล์**

```ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from "./errors.ts";

export type CancellationRole = "admin" | "approver";
export type CancellationDecision = "approve" | "reject";

export interface RequestCancellationParams {
  bookingId: string;
  requesterId: string;
  reason: string;
}

export interface RequestCancellationResult {
  bookingId: string;
  newStatus: "cancelled" | "cancel_requested";
}

export async function requestCancellation(
  client: SupabaseClient,
  params: RequestCancellationParams
): Promise<RequestCancellationResult> {
  const { bookingId, requesterId, reason } = params;

  if (!reason || reason.trim().length === 0) {
    throw new ValidationError("กรุณากรอกเหตุผลการยกเลิก");
  }

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("final_status, requester_id")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    throw new NotFoundError("ไม่พบรายการจองนี้");
  }

  if (booking.requester_id !== requesterId) {
    throw new ForbiddenError("ท่านไม่มีสิทธิ์ยกเลิกรายการนี้");
  }

  if (booking.final_status === "pending") {
    const { data: updated, error: updateError } = await client
      .from("bookings")
      .update({ final_status: "cancelled" })
      .eq("id", bookingId)
      .eq("final_status", "pending")
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new ConflictError(
        "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า"
      );
    }

    const { error: insertError } = await client
      .from("cancellation_logs")
      .insert({
        booking_id: bookingId,
        cancelled_by: requesterId,
        role: "user",
        prev_status: "pending",
        reason,
      });

    if (insertError) throw insertError;

    return { bookingId, newStatus: "cancelled" };
  }

  if (booking.final_status === "approved") {
    const { data: updated, error: updateError } = await client
      .from("bookings")
      .update({ final_status: "cancel_requested", cancellation_reason: reason })
      .eq("id", bookingId)
      .eq("final_status", "approved")
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new ConflictError(
        "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า"
      );
    }

    return { bookingId, newStatus: "cancel_requested" };
  }

  throw new ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า");
}

export interface DecideCancellationParams {
  bookingId: string;
  deciderId: string;
  role: CancellationRole;
  decision: CancellationDecision;
}

export interface DecideCancellationResult {
  bookingId: string;
  newStatus: "cancelled" | "approved";
}

export async function decideCancellation(
  client: SupabaseClient,
  params: DecideCancellationParams
): Promise<DecideCancellationResult> {
  const { bookingId, deciderId, role, decision } = params;

  if (decision !== "approve" && decision !== "reject") {
    throw new ValidationError("การกระทำไม่ถูกต้อง");
  }

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select("final_status, cancellation_reason")
    .eq("id", bookingId)
    .single();

  if (bookingError || !booking) {
    throw new NotFoundError("ไม่พบรายการจองนี้");
  }

  if (booking.final_status !== "cancel_requested") {
    throw new ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า");
  }

  if (decision === "approve") {
    const { data: updated, error: updateError } = await client
      .from("bookings")
      .update({ final_status: "cancelled" })
      .eq("id", bookingId)
      .eq("final_status", "cancel_requested")
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new ConflictError(
        "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า"
      );
    }

    const { error: insertError } = await client
      .from("cancellation_logs")
      .insert({
        booking_id: bookingId,
        cancelled_by: deciderId,
        role,
        prev_status: "cancel_requested",
        reason: booking.cancellation_reason,
      });

    if (insertError) throw insertError;

    triggerCalendarDelete(bookingId);

    return { bookingId, newStatus: "cancelled" };
  }

  const { data: updated, error: updateError } = await client
    .from("bookings")
    .update({ final_status: "approved" })
    .eq("id", bookingId)
    .eq("final_status", "cancel_requested")
    .select("id");

  if (updateError) throw updateError;
  if (!updated || updated.length === 0) {
    throw new ConflictError("รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า");
  }

  const { error: activityError } = await client.from("activity_logs").insert({
    actor_id: deciderId,
    action: "reject_cancel_request",
    target_type: "booking",
    target_id: bookingId,
    detail: { reason: booking.cancellation_reason },
  });

  if (activityError) throw activityError;

  return { bookingId, newStatus: "approved" };
}

// Extension point: เมื่อ Make.com webhook พร้อมใช้งาน (มี MAKE_WEBHOOK_URL
// secret ตั้งไว้แล้ว) ให้เรียก withRetry() + logIntegration() ที่นี่เพื่อลบ
// Google Calendar event ด้วย gcal_event_id — ยังไม่เรียกจริงในตอนนี้ตามที่
// ตกลงกันไว้ (ดู Global Constraints)
function triggerCalendarDelete(_bookingId: string): void {
  // TODO (future track): เรียก Make.com webhook จริง
}
```

- [ ] **Step 2: ตรวจว่า type-check ผ่าน**

Run: `npx tsc --noEmit`
Expected: exit code 0 (ไฟล์นี้อยู่ใน `supabase/functions/` ซึ่งถูก exclude แล้วจาก Task 1 — คำสั่งนี้ตรวจว่าไม่มีไฟล์อื่นพังเท่านั้น)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/processCancellation.ts
git commit -m "feat: add processCancellation shared module"
```

---

### Task 3: `request-cancellation` Edge Function

**Files:**
- Create: `supabase/functions/request-cancellation/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `requestCancellation()` จาก Task 2 (`../_shared/processCancellation.ts`), `withErrorHandling()` จาก `../_shared/handler.ts`, `UnauthorizedError` จาก `../_shared/errors.ts`
- Produces: HTTP endpoint `POST /functions/v1/request-cancellation` รับ `{ booking_id: string, reason: string }` คืน `RequestCancellationResult` (`{ bookingId, newStatus }`)

- [ ] **Step 1: สร้างไฟล์**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { UnauthorizedError } from "../_shared/errors.ts";
import { requestCancellation } from "../_shared/processCancellation.ts";

interface RequestCancellationBody {
  booking_id: string;
  reason: string;
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

    const body: RequestCancellationBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const result = await requestCancellation(adminClient, {
      bookingId: body.booking_id,
      requesterId: user.id,
      reason: body.reason,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: เพิ่ม declarative config ใน `supabase/config.toml`**

หาบรรทัดสุดท้ายของไฟล์ (`[experimental.pgdelta]` block) แล้วเพิ่มต่อท้ายไฟล์:

```toml

[functions.request-cancellation]
verify_jwt = true
```

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน (ไฟล์นี้อยู่ใน `supabase/functions/` ที่ exclude แล้ว คำสั่งนี้ตรวจว่าไฟล์อื่นไม่พัง)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/request-cancellation/index.ts supabase/config.toml
git commit -m "feat: add request-cancellation edge function"
```

---

### Task 4: `decide-cancellation` Edge Function

**Files:**
- Create: `supabase/functions/decide-cancellation/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `decideCancellation()` จาก Task 2, `withErrorHandling()`, `ForbiddenError`/`UnauthorizedError` จาก `../_shared/errors.ts`, `CancellationDecision` type จาก Task 2
- Produces: HTTP endpoint `POST /functions/v1/decide-cancellation` รับ `{ booking_id: string, decision: 'approve' | 'reject' }` คืน `DecideCancellationResult` (`{ bookingId, newStatus }`)

- [ ] **Step 1: สร้างไฟล์**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ForbiddenError, UnauthorizedError } from "../_shared/errors.ts";
import {
  decideCancellation,
  type CancellationDecision,
} from "../_shared/processCancellation.ts";

interface DecideCancellationBody {
  booking_id: string;
  decision: CancellationDecision;
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

    const body: DecideCancellationBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      throw new ForbiddenError("ไม่พบข้อมูลผู้ใช้งาน");
    }

    if (profile.role !== "admin" && profile.role !== "approver") {
      throw new ForbiddenError("ท่านไม่มีสิทธิ์พิจารณาคำขอยกเลิก");
    }

    const result = await decideCancellation(adminClient, {
      bookingId: body.booking_id,
      deciderId: user.id,
      role: profile.role,
      decision: body.decision,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: เพิ่ม declarative config ใน `supabase/config.toml`**

เพิ่มต่อท้ายไฟล์ (ต่อจาก block ของ Task 3):

```toml

[functions.decide-cancellation]
verify_jwt = true
```

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/decide-cancellation/index.ts supabase/config.toml
git commit -m "feat: add decide-cancellation edge function"
```

---

### Task 5: หน้า `/profile/bookings`

**Files:**
- Create: `app/(app)/profile/bookings/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`, Edge Function `request-cancellation` จาก Task 3 (body `{booking_id, reason}`)
- Produces: route `/profile/bookings`

**คำเตือนสำคัญ:** สร้างไดเรกทอรีด้วยชื่อ `app/(app)/profile/bookings/` ให้ตรงเป๊ะ (วงเล็บเปิด-ปิดชิดกัน `(app)` ไม่มี `/` แทรกระหว่างวงเล็บ) — ไดเรกทอรี `app/(app)` มีอยู่แล้วในโปรเจกต์ (มี `app/(app)/home/page.tsx`, `app/(app)/layout.tsx` อยู่แล้ว) ให้สร้างไดเรกทอรีย่อย `profile/bookings/` ข้างในนั้น **ห้ามสร้างไดเรกทอรี `(app)` ใหม่**

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type BookingRow = {
  id: string;
  ref_id: string;
  title: string;
  final_status: string;
  start_time: string;
  end_time: string;
  room_name: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  cancel_requested: "รอ Admin พิจารณาคำขอยกเลิก",
  rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
  cancelled_by_admin: "ยกเลิกแล้ว",
};

export default function ProfileBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadBookings() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("booking_detail")
      .select(
        "id, ref_id, title, final_status, start_time, end_time, room_name, created_at"
      )
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError("ไม่สามารถโหลดรายการจองได้");
      setLoading(false);
      return;
    }

    setBookings((data ?? []) as BookingRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadBookings();
  }, []);

  function openCancelDialog(booking: BookingRow) {
    setCancelTarget(booking);
    setReason("");
    setReasonError(null);
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;

    if (reason.trim().length === 0) {
      setReasonError("กรุณากรอกเหตุผลการยกเลิก");
      return;
    }

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
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-cancellation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: cancelTarget.id,
          reason: reason.trim(),
        }),
      }
    );

    const result = await res.json();

    setSubmitting(false);
    setCancelTarget(null);

    if (!res.ok) {
      setActionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadBookings();
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการจองของฉัน
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && bookings.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ยังไม่มีประวัติการจอง
        </p>
      )}

      <div className="mt-4 space-y-3">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{b.title}</p>
            <p className="text-sm text-text-secondary">
              {b.ref_id} — ห้อง {b.room_name}
            </p>
            <p className="text-sm text-text-secondary">
              สถานะ: {STATUS_LABEL[b.final_status] ?? b.final_status}
            </p>
            {b.final_status === "pending" && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ยกเลิกการจอง
              </button>
            )}
            {b.final_status === "approved" && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ขอยกเลิกการจอง
              </button>
            )}
          </div>
        ))}
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              {cancelTarget.final_status === "pending"
                ? "ยืนยันการยกเลิกการจอง"
                : "ยืนยันการส่งคำขอยกเลิก"}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {cancelTarget.title} ({cancelTarget.ref_id})
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="กรุณาระบุเหตุผลการยกเลิก"
              rows={3}
              className="mt-3 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            {reasonError && (
              <p className="mt-1 text-sm text-danger-text">{reasonError}</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
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
Expected: build สำเร็จ, route list มี `/profile/bookings` (ตรวจด้วย `ls "app/(app)/profile/bookings/"` ก่อนด้วยว่ามีแค่ไฟล์นี้ ไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/profile/bookings/page.tsx"
git commit -m "feat: add profile bookings page with cancel/request-cancel dialog"
```

---

### Task 6: หน้า `/approver/cancel-requests`

**Files:**
- Create: `app/(app)/approver/cancel-requests/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`, Edge Function `decide-cancellation` จาก Task 4 (body `{booking_id, decision}`)
- Produces: route `/approver/cancel-requests`

**คำเตือนสำคัญ:** ไดเรกทอรี `app/(app)/approver/` มีอยู่แล้ว (ถ้า merge Track B แล้วจะมี `page.tsx`/`history/` อยู่ข้างใน แต่ในสถานะปัจจุบันของ worktree นี้ยังไม่มี Track B merge เข้ามา — ให้สร้างไดเรกทอรี `app/(app)/approver/cancel-requests/` ตรงตามชื่อนี้เท่านั้น ห้ามสร้างไดเรกทอรี `(app)` ใหม่ซ้ำ

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CancelRequestRow = {
  id: string;
  ref_id: string;
  title: string;
  room_name: string;
  requester_name: string;
  cancellation_reason: string | null;
  created_at: string;
};

export default function CancelRequestsPage() {
  const [requests, setRequests] = useState<CancelRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    booking: CancelRequestRow;
    decision: "approve" | "reject";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadRequests() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("booking_detail")
      .select(
        "id, ref_id, title, room_name, requester_name, cancellation_reason, created_at, final_status"
      )
      .eq("final_status", "cancel_requested")
      .order("created_at", { ascending: true });

    if (error) {
      setLoadError("ไม่สามารถโหลดรายการคำขอยกเลิกได้");
      setLoading(false);
      return;
    }

    setRequests((data ?? []) as CancelRequestRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests();
  }, []);

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
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/decide-cancellation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: confirmTarget.booking.id,
          decision: confirmTarget.decision,
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

    await loadRequests();
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        คำขอยกเลิกการจอง
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && requests.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่มีคำขอยกเลิกในขณะนี้
        </p>
      )}

      <div className="mt-4 space-y-3">
        {requests.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{r.title}</p>
            <p className="text-sm text-text-secondary">
              {r.ref_id} — ห้อง {r.room_name} — ผู้จอง {r.requester_name}
            </p>
            <p className="mt-2 text-sm text-text-primary">
              เหตุผล: {r.cancellation_reason ?? "-"}
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setConfirmTarget({ booking: r, decision: "approve" })
                }
                className="rounded-sm bg-success-solid px-4 py-2 text-sm font-medium text-text-on-primary"
              >
                อนุมัติการยกเลิก
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmTarget({ booking: r, decision: "reject" })
                }
                className="rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ปฏิเสธคำขอ
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการ
              {confirmTarget.decision === "approve"
                ? "อนุมัติการยกเลิก"
                : "ปฏิเสธคำขอ"}
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
Expected: build สำเร็จ, route list มี `/approver/cancel-requests` (ตรวจ `ls "app/(app)/approver/cancel-requests/"` ว่าไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/approver/cancel-requests/page.tsx"
git commit -m "feat: add cancel-requests review page for approver/admin"
```

---

### Task 7: Manual Verification (แบ่งเป็นส่วนที่ทดสอบได้ตอนนี้ กับส่วนที่รอ deploy)

**Files:** ไม่มี (verification เท่านั้น)

**ส่วนที่ทดสอบได้ตอนนี้ (ไม่ต้องพึ่ง Edge Function):**

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, route list มี `/profile/bookings` และ `/approver/cancel-requests`

- [ ] **Step 2: ทดสอบ `/profile/bookings` — login เป็น user**

`npm run dev`, login ด้วย `user@test.local`, เข้า `/profile/bookings`
Expected: เห็น 4 booking จาก seed data (Booking 1-4) — ปุ่มยกเลิกแสดงเฉพาะ Booking 1 (`pending`, ข้อความปุ่ม "ยกเลิกการจอง") และ Booking 2 (`approved`, ข้อความปุ่ม "ขอยกเลิกการจอง") — Booking 3 (`rejected`)/Booking 4 (`cancel_requested`) ไม่มีปุ่ม

- [ ] **Step 3: ทดสอบ middleware gate ของ `/approver/cancel-requests`**

Login ด้วย `user@test.local` (role='user') พยายามเข้า `/approver/cancel-requests` ตรงๆ ทาง URL
Expected: middleware redirect ไป `/home` ทันที (route นี้ inherit จาก prefix `/approver` ที่ตั้งไว้แล้วใน `lib/supabase/middleware.ts` — `["approver","admin"]` — ไม่ต้องแก้ไฟล์ middleware เพิ่ม)

Login ด้วย `admin@test.local` เข้า `/approver/cancel-requests`
Expected: เข้าได้ปกติ

**ส่วนที่ต้อง deploy Edge Function ก่อนถึงจะทดสอบได้จริง:**

- [ ] **Step 4: Deploy Edge Functions**

เซสชันนี้ไม่มี Deno CLI, ไม่มี Supabase CLI, และ Supabase MCP ไม่ได้เชื่อมต่อ — **ต้องให้ผู้ใช้ทำขั้นตอนนี้เอง**:
- Reconnect Supabase MCP แล้วใช้ `deploy_edge_function` กับ `request-cancellation` และ `decide-cancellation` (ทั้งคู่ `verify_jwt=true`)
- หรือติดตั้ง Supabase CLI แล้วรัน `supabase functions deploy request-cancellation` และ `supabase functions deploy decide-cancellation`

(หมายเหตุ: `processCancellation.ts` อยู่ใน `_shared/` ไม่ต้อง deploy แยก — ถูก bundle ไปกับทั้งสอง Edge Function อัตโนมัติตอน deploy)

- [ ] **Step 5: ทดสอบ self-cancel `pending` (หลัง deploy สำเร็จ)**

Login `user@test.local` กด "ยกเลิกการจอง" ที่ Booking 1 กรอกเหตุผล ยืนยัน
Expected: `bookings.final_status` เป็น `cancelled` ทันที มีแถวใหม่ใน `cancellation_logs` (`role='user'`, `prev_status='pending'`) `booking_slots` ของ Booking 1 ถูกลบ (ตรวจผ่าน `trg_release_slot`)

- [ ] **Step 6: ทดสอบส่งคำขอยกเลิก `approved` (หลัง deploy สำเร็จ)**

Login `user@test.local` กด "ขอยกเลิกการจอง" ที่ Booking 2 กรอกเหตุผล ยืนยัน
Expected: `bookings.final_status` เป็น `cancel_requested`, `cancellation_reason` ถูกบันทึก **ไม่มี** แถวใหม่ใน `cancellation_logs`, `booking_slots` ของ Booking 2 **ยังไม่ถูกลบ**

- [ ] **Step 7: ทดสอบอนุมัติคำขอยกเลิก (หลัง deploy สำเร็จ)**

Login `admin@test.local` เข้า `/approver/cancel-requests` เห็น Booking 4 (seed data) และ Booking 2 (จาก Step 6) กด "อนุมัติการยกเลิก" ที่ Booking 4
Expected: `bookings.final_status` เป็น `cancelled` มีแถวใหม่ใน `cancellation_logs` (`role='admin'`, `prev_status='cancel_requested'`, `reason`=เหตุผลเดิมของ Booking 4)

Login `approver1@test.local` เข้า `/approver/cancel-requests`
Expected: เห็น Booking 2 (ยังค้างอยู่จาก Step 6) รายการเดียวกับที่ admin เห็น (ไม่ filter ตามใคร)

- [ ] **Step 8: ทดสอบปฏิเสธคำขอยกเลิก (หลัง deploy สำเร็จ)**

Login `approver1@test.local` กด "ปฏิเสธคำขอ" ที่ Booking 2
Expected: `bookings.final_status` กลับเป็น `approved` มีแถวใหม่ใน `activity_logs` (`action='reject_cancel_request'`, `actor_id`=approver1) **ไม่มี** แถวใหม่ใน `cancellation_logs`

- [ ] **Step 9: ทดสอบ race condition guard**

จำลองด้วยการเรียก `request-cancellation` หรือ `decide-cancellation` 2 ครั้งติดกันเร็วๆ ด้วย booking เดียวกัน (เปิด 2 แท็บกดพร้อมกัน หรือเรียก fetch 2 ครั้งจาก console)
Expected: ครั้งแรกสำเร็จ ครั้งที่สองได้ `ConflictError` "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า" — ตรวจใน DB ว่าไม่มีการเปลี่ยนสถานะซ้อนกัน 2 รอบ

---

## Self-Review Notes

- **Spec coverage:** `processCancellation.ts` (requestCancellation + decideCancellation + triggerCalendarDelete stub) → Task 2 ครบทั้ง logic ตามสเปคทุกข้อ, `request-cancellation` Edge Function → Task 3, `decide-cancellation` Edge Function → Task 4, `/profile/bookings` → Task 5, `/approver/cancel-requests` → Task 6, success criteria ทั้ง 9 ข้อในสเปค → Task 7 ครบ (แบ่งทดสอบได้ตอนนี้ 3 ข้อ [build, profile/bookings query, middleware gate], รอ deploy 6 ข้อ)
- **Placeholder scan:** ไม่มี TBD/TODO ที่ไม่มีเนื้อหา (comment `// TODO (future track)` ใน `triggerCalendarDelete` เป็นการทำเครื่องหมาย extension point ตามสเปคโดยตรง ไม่ใช่งานค้างในแผนนี้)
- **Type consistency:** `RequestCancellationResult`/`DecideCancellationResult` จาก Task 2 ใช้เป็น response shape ตรงๆ ใน Task 3/4 — field names (`bookingId`, `newStatus`) สอดคล้องกันทุกไฟล์ที่อ้างถึง, `CancellationDecision` type ถูก import และใช้ตรงกันระหว่าง Task 2 และ Task 4, `CancellationRole` (`'admin'|'approver'`) ใช้ตรงกันระหว่าง Task 2 และ Task 4 (resolve จาก `users.role` ใน Task 4)
- **Middleware:** ไม่มี task แก้ `lib/supabase/middleware.ts` เพราะ `ROUTE_ROLES` ที่มีอยู่แล้ว (`/approver` → `["approver","admin"]`, `/profile` → `["user","approver","admin"]`) ครอบคลุม `/approver/cancel-requests` และ `/profile/bookings` อยู่แล้วผ่าน longest-prefix matching — ตรวจยืนยันด้วย Task 7 Step 3
- **Deno verification gap:** เหมือน Track A/B — Task 2-4 verify ด้วย manual review เท่านั้น, Task 7 แยกส่วนทดสอบได้ตอนนี้ (build + query behavior) vs ต้องรอ deploy (live cancel/decide flow) ไว้ชัดเจน
- **Route-group directory bug (Track B lesson):** เพิ่มคำเตือนชัดเจนใน Task 5/6 และ Global Constraints ให้ตรวจ `ls "app/(app)/..."` หลังสร้างไฟล์ทุกครั้ง ป้องกันบั๊กเดิมที่เคยเกิดใน Track B Task 5
