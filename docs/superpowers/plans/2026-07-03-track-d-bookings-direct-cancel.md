# Track D (sub-project 2) — รายการจองทั้งหมด + ยกเลิกโดย Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า `/dashboard/bookings` ให้ Admin เห็นรายการจองทั้งหมดในระบบ (พร้อม filter ห้องและ pagination) และยกเลิกการจองใดๆ ได้ทันทีโดยไม่ต้องขออนุมัติจากใคร ("ยกเลิกโดย Admin")

**Architecture:** Edge Function เดียว `direct-cancel-booking` (ไม่มี shared module แยก เพราะมีจุดเรียกใช้เดียว) ทำ atomic state transition + บันทึก `cancellation_logs` — หน้า `/dashboard/bookings` query `booking_detail` view ตรงจาก client (RLS อนุญาต staff อ่านทุกแถวอยู่แล้ว) พร้อม filter ห้องและ pagination แบบ range-based

**Tech Stack:** Next.js 16 App Router (client component), Supabase Edge Function (Deno), `@supabase/supabase-js@2`

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10) — ใช้ class จาก `docs/DESIGN.md` เท่านั้น
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9)
- **`direct-cancel-booking` ห่อด้วย `withErrorHandling()`** จาก `_shared/handler.ts`, throw `AppError` subclass จาก `_shared/errors.ts` เท่านั้น (CLAUDE.md กฎข้อ 1)
- **Race condition guard แบบ atomic UPDATE-WHERE เท่านั้น** (CLAUDE.md กฎข้อ 6) — `UPDATE bookings SET final_status='cancelled_by_admin' WHERE id=... AND final_status = <ค่าที่คาดไว้>` แล้วเช็คจำนวนแถวที่อัปเดตก่อนไป insert log
- **`triggerCalendarDelete()` เป็น stub เท่านั้น** — ห้ามเรียก `logIntegration()` เพราะยังไม่มีการเรียก external service จริง
- **ไม่ import จากไฟล์ของ Track C** — worktree นี้ fork จาก `main@76a582c` ไม่มี `processCancellation.ts` ของ Track C อยู่จริง (Track C ยังไม่ merge) เขียน logic แบบ self-contained ในไฟล์ `direct-cancel-booking/index.ts` เท่านั้น
- **ผู้เรียก `direct-cancel-booking` ต้องมี `role === 'admin'` เท่านั้น** ไม่ใช่ `'approver'` แม้ CLAUDE.md จะเขียนกำกวมว่า "Admin-Approver" — เหตุผลอยู่ในสเปค (หน้า `/dashboard/bookings` เป็นหน้า Admin-only ตาม page list)
- **ทุก `fetch()` ไปยัง Edge Function จาก client ต้องห่อด้วย `try/catch/finally`** เสมอ (บทเรียนจาก sub-project 1's final review — I-1: การไม่ห่อ try/catch ทำให้ UI ค้างถาวรเมื่อ network ล้มเหลว ไม่ใช่แค่กรณี HTTP response ไม่ ok) — `finally` ต้อง reset submitting state, `catch` ต้องแสดงข้อความ error ภาษาไทย
- **ไม่ต้องแก้ `lib/supabase/middleware.ts`** — prefix `/dashboard` → `["admin"]` ที่มีอยู่แล้วครอบคลุม `/dashboard/bookings` ผ่าน longest-prefix matching
- **`verify_jwt=true` ต้องประกาศใน `supabase/config.toml` แบบ declarative** สำหรับ `direct-cancel-booking`
- **ไม่ต้องเพิ่ม `"supabase/functions"` เข้า tsconfig.json exclude อีก** — sub-project 1 (Task 1) ทำไปแล้วในเวิร์กทรีนี้ ตรวจสอบด้วย `cat tsconfig.json` ก่อนเริ่มถ้าไม่แน่ใจ แต่ไม่ต้องทำซ้ำ
- **ไม่มี Deno CLI / Supabase CLI / Supabase MCP ในเซสชันนี้** — Edge Function `.ts` verify ด้วย manual code review + `npx tsc --noEmit`/`npm run build` (เฉพาะไฟล์ frontend) เท่านั้น

## File Structure

| File | หน้าที่ |
|---|---|
| `supabase/functions/direct-cancel-booking/index.ts` | Edge Function ยกเลิกการจองโดย Admin ทุกสถานะ |
| `supabase/config.toml` | เพิ่ม `[functions.direct-cancel-booking]` พร้อม `verify_jwt=true` |
| `app/(app)/dashboard/bookings/page.tsx` | หน้ารายการจองทั้งหมด + filter ห้อง + pagination + ปุ่มยกเลิก |

---

### Task 1: `direct-cancel-booking` Edge Function

**Files:**
- Create: `supabase/functions/direct-cancel-booking/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `withErrorHandling()` จาก `../_shared/handler.ts`, `ForbiddenError`/`UnauthorizedError`/`ValidationError`/`NotFoundError`/`ConflictError` จาก `../_shared/errors.ts`
- Produces: HTTP endpoint `POST /functions/v1/direct-cancel-booking` รับ `{ booking_id: string, reason: string }` คืน `{ bookingId: string, newStatus: 'cancelled_by_admin' }`

- [ ] **Step 1: สร้างไฟล์**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../_shared/errors.ts";

interface DirectCancelBookingBody {
  booking_id: string;
  reason: string;
}

const TERMINAL_STATUSES = ["cancelled", "cancelled_by_admin", "rejected"];

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

    const body: DirectCancelBookingBody = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: caller, error: callerError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerError || !caller || caller.role !== "admin") {
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ยกเลิกรายการนี้");
    }

    if (!body.reason || body.reason.trim().length === 0) {
      throw new ValidationError("กรุณากรอกเหตุผลการยกเลิก");
    }

    const { data: booking, error: bookingError } = await adminClient
      .from("bookings")
      .select("final_status, gcal_event_id")
      .eq("id", body.booking_id)
      .single();

    if (bookingError || !booking) {
      throw new NotFoundError("ไม่พบรายการจองนี้");
    }

    if (TERMINAL_STATUSES.includes(booking.final_status)) {
      throw new ConflictError("รายการนี้ถูกยกเลิกไปแล้ว");
    }

    const prevStatus = booking.final_status;

    const { data: updated, error: updateError } = await adminClient
      .from("bookings")
      .update({ final_status: "cancelled_by_admin" })
      .eq("id", body.booking_id)
      .eq("final_status", prevStatus)
      .select("id");

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new ConflictError(
        "รายการนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณารีเฟรชหน้า"
      );
    }

    const { error: insertError } = await adminClient
      .from("cancellation_logs")
      .insert({
        booking_id: body.booking_id,
        cancelled_by: user.id,
        role: "admin",
        prev_status: prevStatus,
        reason: body.reason,
      });

    if (insertError) throw insertError;

    if (booking.gcal_event_id) {
      triggerCalendarDelete(body.booking_id);
    }

    return new Response(
      JSON.stringify({
        bookingId: body.booking_id,
        newStatus: "cancelled_by_admin",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  })
);

// Extension point: เมื่อ Make.com webhook พร้อมใช้งาน ให้เรียก withRetry() +
// logIntegration() ที่นี่เพื่อลบ Google Calendar event ด้วย gcal_event_id
// ยังไม่เรียกจริงในตอนนี้ (เขียนแยกจาก stub เดียวกันของ Track C โดยตั้งใจ
// เพราะ worktree นี้ไม่มีไฟล์ของ Track C — ดู Global Constraints)
function triggerCalendarDelete(_bookingId: string): void {
  // TODO (future track): เรียก Make.com webhook จริง
}
```

- [ ] **Step 2: เพิ่ม declarative config ใน `supabase/config.toml`**

หาบรรทัดสุดท้ายของไฟล์ (`[functions.update-approval-chain]` block จาก sub-project 1) แล้วเพิ่มต่อท้ายไฟล์:

```toml

[functions.direct-cancel-booking]
verify_jwt = true
```

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/direct-cancel-booking/index.ts supabase/config.toml
git commit -m "feat: add direct-cancel-booking edge function"
```

---

### Task 2: หน้า `/dashboard/bookings`

**Files:**
- Create: `app/(app)/dashboard/bookings/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`, Edge Function `direct-cancel-booking` จาก Task 1 (body `{booking_id, reason}`)
- Produces: route `/dashboard/bookings`

**คำเตือนสำคัญ:** สร้างไดเรกทอรีด้วยชื่อ `app/(app)/dashboard/bookings/` ให้ตรงเป๊ะ (วงเล็บเปิด-ปิดชิดกัน `(app)` ไม่มี `/` แทรก) — ไดเรกทอรี `app/(app)/dashboard/` มีอยู่แล้ว (มี `rooms/`, `users/`, `settings/` จาก sub-project 1) ใช้ `mkdir -p "app/(app)/dashboard/bookings"` เป็นคำสั่งเดียว **ห้ามสร้างไดเรกทอรี `(app)` ใหม่**

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
  room_id: string;
  room_name: string;
  requester_name: string;
  created_at: string;
};

type Room = {
  id: string;
  name: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  cancel_requested: "รอ Admin พิจารณาคำขอยกเลิก",
  rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
  cancelled_by_admin: "ยกเลิกแล้ว",
};

const TERMINAL_STATUSES = ["cancelled", "cancelled_by_admin", "rejected"];
const PAGE_SIZE = 20;

export default function DashboardBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomFilter, setRoomFilter] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadRooms() {
      const supabase = createClient();
      const { data } = await supabase
        .from("rooms")
        .select("id, name")
        .order("name", { ascending: true });
      setRooms((data ?? []) as Room[]);
    }
    loadRooms();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("booking_detail")
      .select(
        "id, ref_id, title, final_status, room_id, room_name, requester_name, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (roomFilter) {
      query = query.eq("room_id", roomFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      setLoadError("ไม่สามารถโหลดรายการจองได้");
      setLoading(false);
      return;
    }

    setBookings((data ?? []) as BookingRow[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, roomFilter]);

  function handleRoomFilterChange(value: string) {
    setRoomFilter(value);
    setPage(0);
  }

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

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/direct-cancel-booking`,
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

      if (!res.ok) {
        setActionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setCancelTarget(null);
      await loadBookings();
    } catch {
      setActionError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        การจองทั้งหมด
      </h1>

      <div className="mt-4">
        <select
          value={roomFilter}
          onChange={(e) => handleRoomFilterChange(e.target.value)}
          className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
        >
          <option value="">ทุกห้อง</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && bookings.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">ไม่พบรายการจอง</p>
      )}

      <div className="mt-4 space-y-3">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{b.title}</p>
            <p className="text-sm text-text-secondary">
              {b.ref_id} — ห้อง {b.room_name} — ผู้จอง {b.requester_name}
            </p>
            <p className="text-sm text-text-secondary">
              สถานะ: {STATUS_LABEL[b.final_status] ?? b.final_status}
            </p>
            {!TERMINAL_STATUSES.includes(b.final_status) && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ยกเลิกโดย Admin
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
        >
          ก่อนหน้า
        </button>
        <span className="text-sm text-text-secondary">
          หน้า {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={page + 1 >= totalPages}
          className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
        >
          ถัดไป
        </button>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการยกเลิกโดย Admin
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
                className="rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
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
Expected: build สำเร็จ, route list มี `/dashboard/bookings` (ตรวจด้วย `ls "app/(app)/dashboard/bookings/"` ก่อนด้วยว่ามีแค่ไฟล์นี้ ไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/bookings/page.tsx"
git commit -m "feat: add dashboard bookings list page with room filter, pagination, and admin cancel"
```

---

### Task 3: Manual Verification (แบ่งเป็นส่วนที่ทดสอบได้ตอนนี้ กับส่วนที่รอ deploy)

**Files:** ไม่มี (verification เท่านั้น)

**ส่วนที่ทดสอบได้ตอนนี้ (ไม่ต้องพึ่ง Edge Function):**

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, route list มี `/dashboard/bookings`

- [ ] **Step 2: ทดสอบ `/dashboard/bookings` — login เป็น admin**

`npm run dev`, login ด้วย `admin@test.local`, เข้า `/dashboard/bookings`
Expected: เห็น booking ทั้งหมดจาก seed data (4 รายการ) เรียงตาม `created_at` ล่าสุดก่อน — ปุ่ม "ยกเลิกโดย Admin" แสดงเฉพาะ Booking 1 (`pending`), 2 (`approved`), 4 (`cancel_requested`) ไม่แสดงกับ Booking 3 (`rejected`)

- [ ] **Step 3: ทดสอบ filter ห้อง**

เลือกห้องหนึ่งจาก dropdown
Expected: เห็นเฉพาะ booking ของห้องนั้น — เลือก "ทุกห้อง" กลับมาเห็นครบ 4 รายการ

- [ ] **Step 4: ทดสอบ middleware gate**

Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/bookings` ตรงๆ ทาง URL
Expected: ถูก middleware redirect ไป `/home` ทันที (route นี้ inherit จาก prefix `/dashboard` ที่ตั้งไว้แล้ว — `["admin"]` — ไม่ต้องแก้ไฟล์ middleware เพิ่ม)

**ส่วนที่ต้อง deploy Edge Function ก่อนถึงจะทดสอบได้จริง:**

- [ ] **Step 5: Deploy Edge Function**

เซสชันนี้ไม่มี Deno CLI, ไม่มี Supabase CLI, และ Supabase MCP ไม่ได้เชื่อมต่อ — **ต้องให้ผู้ใช้ทำขั้นตอนนี้เอง**:
- Reconnect Supabase MCP แล้วใช้ `deploy_edge_function` กับ `direct-cancel-booking` (`verify_jwt=true`)
- หรือติดตั้ง Supabase CLI แล้วรัน `supabase functions deploy direct-cancel-booking`

- [ ] **Step 6: ทดสอบยกเลิกโดย Admin จริง (หลัง deploy สำเร็จ)**

Login `admin@test.local` กด "ยกเลิกโดย Admin" ที่ Booking 1 (`pending`) กรอกเหตุผล ยืนยัน
Expected: `bookings.final_status` เป็น `cancelled_by_admin` ทันที มีแถวใหม่ใน `cancellation_logs` (`role='admin'`, `prev_status='pending'`) `booking_slots` ของ Booking 1 ถูกลบ (ผ่าน `trg_release_slot`)

- [ ] **Step 7: ทดสอบยกเลิก Booking ที่เป็น `cancel_requested` (หลัง deploy สำเร็จ)**

กด "ยกเลิกโดย Admin" ที่ Booking 4 (`cancel_requested` จาก seed data)
Expected: `final_status` เป็น `cancelled_by_admin` ทันที ข้าม flow ของ `/approver/cancel-requests` ไปเลยตามที่ออกแบบไว้

- [ ] **Step 8: ทดสอบ race condition guard**

จำลองด้วยการเรียก `direct-cancel-booking` 2 ครั้งติดกันเร็วๆ ด้วย booking เดียวกัน (เปิด 2 แท็บกดพร้อมกัน หรือเรียก fetch 2 ครั้งจาก console)
Expected: ครั้งแรกสำเร็จ ครั้งที่สองได้ `ConflictError` — ตรวจใน DB ว่ามีแค่ `cancellation_logs` แถวเดียวต่อ booking นี้

---

## Self-Review Notes

- **Spec coverage:** `direct-cancel-booking` → Task 1 ครบทั้ง logic ตามสเปคทุกข้อ, `/dashboard/bookings` (filter+pagination+ปุ่มยกเลิก) → Task 2, success criteria ทั้ง 8 ข้อในสเปค → Task 3 ครบ (แบ่งทดสอบได้ตอนนี้ 4 ข้อ, รอ deploy 4 ข้อ)
- **Placeholder scan:** ไม่มี TBD/TODO ที่ไม่มีเนื้อหา (comment `// TODO (future track)` ใน `triggerCalendarDelete` เป็นการทำเครื่องหมาย extension point ตามสเปคโดยตรง)
- **Type consistency:** response shape `{ bookingId, newStatus }` จาก Task 1 ไม่ได้ถูกอ่านโดยตรงใน Task 2 (หน้าแค่เช็ค `res.ok` แล้ว reload ทั้งชุดใหม่) แต่ field names ยังคงสอดคล้องกับ pattern ของ track อื่นเพื่อความสม่ำเสมอ — `BookingRow` type ใน Task 2 ตรงกับ column ที่ query จริงจาก `booking_detail` (ยืนยันแล้วว่า view มี `room_id` เป็นคอลัมน์จริงจาก migration 012)
- **Middleware:** ไม่มี task แก้ `lib/supabase/middleware.ts` เพราะ prefix `/dashboard` ครอบคลุมอยู่แล้ว — ตรวจยืนยันด้วย Task 3 Step 4
- **บทเรียนจาก sub-project 1's final review (I-1) ถูกนำมาใช้ล่วงหน้า:** `handleConfirmCancel()` ใน Task 2 ห่อ fetch ด้วย try/catch/finally ตั้งแต่ต้น ไม่ต้องรอให้ final review เจอปัญหาเดิมซ้ำ
- **Route-group directory bug (Track B lesson):** เพิ่มคำเตือนชัดเจนใน Task 2 ให้ตรวจ `ls "app/(app)/..."` หลังสร้างไฟล์
- **ไม่ทำ Task ซ้ำจาก sub-project 1:** ไม่มี task "exclude supabase/functions จาก tsc" เพราะทำไปแล้วในเวิร์กทรีนี้ — Global Constraints ระบุชัดเจนว่าไม่ต้องทำซ้ำ
