# Track D (sub-project 4) — ภาพรวมระบบ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า `/dashboard` เป็น landing page ของ Admin แสดงสถิตินับ (booking/ห้อง/ผู้ใช้) พร้อมการ์ด highlight จำนวนรอดำเนินการ

**Architecture:** หน้าเดียว read-only ทั้งหมด ยิง count query แบบขนาน (`Promise.all`) ตรงจาก Supabase browser client — ไม่มี view สรุปสำเร็จรูปในฐานข้อมูล ไม่มี Edge Function เพราะไม่มีการเขียนข้อมูล

**Tech Stack:** Next.js 16 App Router (client component), `@supabase/supabase-js@2`, `next/link`

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10) — ใช้ class จาก `docs/DESIGN.md` เท่านั้น รวม `bg-warning-surface`/`border-warning-border`/`text-warning-text` สำหรับการ์ด highlight
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9)
- **ไม่ต้องแก้ `lib/supabase/middleware.ts`** — prefix `/dashboard` → `["admin"]` ที่มีอยู่แล้วครอบคลุม `/dashboard` เอง (exact match ของ prefix)
- **ไม่มี Edge Function ในสโคปนี้** — หน้านี้ read-only ทั้งหมด
- **ลิงก์ไป `/approver` และ `/approver/cancel-requests` เป็นเรื่องปกติแม้หน้าเหล่านั้นจะยังไม่มีอยู่จริงใน worktree นี้** (มาจาก Track B/C ซึ่งยังไม่ merge) — ใช้ `next/link` ชี้ไปตามปกติ ไม่ต้องมี fallback หรือเงื่อนไขพิเศษ
- **ไม่ต้องเพิ่ม `"supabase/functions"` เข้า tsconfig.json exclude อีก** — ทำไปแล้วในเวิร์กทรีนี้ตั้งแต่ sub-project 1

## File Structure

| File | หน้าที่ |
|---|---|
| `app/(app)/dashboard/page.tsx` | หน้าภาพรวมระบบ — สถิตินับ + การ์ด highlight |

---

### Task 1: หน้า `/dashboard`

**Files:**
- Create: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`, `Link` จาก `next/link`
- Produces: route `/dashboard`

**คำเตือนสำคัญ:** สร้างไฟล์ตรง `app/(app)/dashboard/page.tsx` (ไม่ใช่ไดเรกทอรีย่อยใหม่ — ไดเรกทอรี `app/(app)/dashboard/` มีอยู่แล้วพร้อม `activity/`, `bookings/`, `rooms/`, `settings/`, `users/` จาก sub-project ก่อนหน้า สร้างแค่ไฟล์ `page.tsx` ตรงนั้นเลย ไม่ต้องสร้างไดเรกทอรีใหม่) ตรวจสอบด้วย `ls "app/(app)/dashboard/"` ก่อนและหลังสร้างไฟล์ว่ามีแค่ `page.tsx` เพิ่มเข้ามา ไดเรกทอรีย่อยเดิมยังอยู่ครบ

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Stats = {
  bookingPending: number;
  bookingApproved: number;
  bookingCancelRequested: number;
  bookingRejected: number;
  bookingCancelled: number;
  roomAvailable: number;
  roomBusy: number;
  roomMaintenance: number;
  userCount: number;
  approverCount: number;
  adminCount: number;
  pendingAdminApproval: number;
  pendingCancelDecision: number;
};

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      setLoadError(null);

      const supabase = createClient();

      async function countBookings(
        finalStatus: string,
        currentStep?: number
      ): Promise<number> {
        let query = supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("final_status", finalStatus);
        if (currentStep !== undefined) {
          query = query.eq("current_step", currentStep);
        }
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      }

      async function countRooms(status: string): Promise<number> {
        const { count, error } = await supabase
          .from("rooms")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        if (error) throw error;
        return count ?? 0;
      }

      async function countUsers(role: string): Promise<number> {
        const { count, error } = await supabase
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("role", role);
        if (error) throw error;
        return count ?? 0;
      }

      try {
        const [
          bookingPending,
          bookingApproved,
          bookingCancelRequested,
          bookingRejected,
          bookingCancelled,
          bookingCancelledByAdmin,
          roomAvailable,
          roomBusy,
          roomMaintenance,
          userCount,
          approverCount,
          adminCount,
          pendingAdminApproval,
        ] = await Promise.all([
          countBookings("pending"),
          countBookings("approved"),
          countBookings("cancel_requested"),
          countBookings("rejected"),
          countBookings("cancelled"),
          countBookings("cancelled_by_admin"),
          countRooms("available"),
          countRooms("busy"),
          countRooms("maintenance"),
          countUsers("user"),
          countUsers("approver"),
          countUsers("admin"),
          countBookings("pending", 0),
        ]);

        setStats({
          bookingPending,
          bookingApproved,
          bookingCancelRequested,
          bookingRejected,
          bookingCancelled: bookingCancelled + bookingCancelledByAdmin,
          roomAvailable,
          roomBusy,
          roomMaintenance,
          userCount,
          approverCount,
          adminCount,
          pendingAdminApproval,
          pendingCancelDecision: bookingCancelRequested,
        });
      } catch {
        setLoadError("ไม่สามารถโหลดข้อมูลภาพรวมได้");
      }
    }

    loadStats();
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ภาพรวมระบบ
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}

      {stats && (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/approver"
              className="rounded-lg border border-warning-border bg-warning-surface p-5"
            >
              <p className="text-sm text-text-secondary">รอ Admin อนุมัติ</p>
              <p className="text-2xl font-semibold text-warning-text">
                {stats.pendingAdminApproval}
              </p>
            </Link>
            <Link
              href="/approver/cancel-requests"
              className="rounded-lg border border-warning-border bg-warning-surface p-5"
            >
              <p className="text-sm text-text-secondary">
                รอพิจารณาคำขอยกเลิก
              </p>
              <p className="text-2xl font-semibold text-warning-text">
                {stats.pendingCancelDecision}
              </p>
            </Link>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">การจอง</p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">รออนุมัติ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingPending}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">อนุมัติแล้ว</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingApproved}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">
                  รอพิจารณายกเลิก
                </p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingCancelRequested}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ถูกปฏิเสธ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingRejected}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ยกเลิกแล้ว</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.bookingCancelled}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">ห้องประชุม</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ว่าง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomAvailable}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ไม่ว่าง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomBusy}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ปิดปรับปรุง</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.roomMaintenance}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="font-medium text-text-primary">ผู้ใช้งาน</p>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ผู้ใช้ทั่วไป</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.userCount}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ผู้อนุมัติ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.approverCount}
                </p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-surface-card p-4">
                <p className="text-sm text-text-secondary">ผู้ดูแลระบบ</p>
                <p className="text-xl font-semibold text-text-primary">
                  {stats.adminCount}
                </p>
              </div>
            </div>
          </div>
        </>
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
Expected: build สำเร็จ, route list มี `/dashboard` (ตรวจด้วย `ls "app/(app)/dashboard/"` ว่ามี `page.tsx` เพิ่มเข้ามาอยู่ข้าง `activity/`, `bookings/`, `rooms/`, `settings/`, `users/` — ไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้นที่ระดับบนสุด)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/page.tsx"
git commit -m "feat: add dashboard overview page with stats and pending-action highlights"
```

---

### Task 2: Manual Verification

**Files:** ไม่มี (verification เท่านั้น)

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, route list มี `/dashboard`

- [ ] **Step 2: ทดสอบ `/dashboard` — login เป็น admin**

`npm run dev`, login ด้วย `admin@test.local`, เข้า `/dashboard`
Expected: เห็นตัวเลขสถิติตรงกับ seed data — booking (`pending`=1, `approved`=1, `rejected`=1, `cancel_requested`=1, "ยกเลิกแล้ว"=0), ห้อง (`available`=3, `maintenance`=1, `busy`=0), ผู้ใช้ (`user`=1, `approver`=2, `admin`=1)

- [ ] **Step 3: ทดสอบการ์ด highlight**

ตรวจตัวเลขในการ์ด "รอ Admin อนุมัติ" (คาดว่า = 1) และ "รอพิจารณาคำขอยกเลิก" (คาดว่า = 1)
กดการ์ด "รอ Admin อนุมัติ" → ตรวจว่า `window.location.href` เปลี่ยนไปเป็น `/approver` ถูกต้อง (หน้าปลายทางอาจ 404 เพราะยังไม่ merge Track B เข้า worktree นี้ — ตรวจแค่ URL ที่นำทางไปว่าถูกต้อง ไม่ต้องตรวจเนื้อหาหน้าปลายทาง)

- [ ] **Step 4: ทดสอบ middleware gate**

Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard` ตรงๆ ทาง URL
Expected: ถูก middleware redirect ไป `/home` ทันที (ครอบคลุมด้วย prefix `/dashboard` อยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)

หมายเหตุ: ไม่มี Edge Function ในสโคปนี้ ดังนั้นทุกข้อทดสอบได้ในเซสชันนี้ทั้งหมด ไม่มีส่วนที่ต้อง deferred ไปให้ผู้ใช้ deploy

---

## Self-Review Notes

- **Spec coverage:** หน้า `/dashboard` (สถิติ 3 กลุ่ม + การ์ด highlight 2 การ์ด) → Task 1 ครบทุกข้อในสเปค, success criteria ทั้ง 5 ข้อ → Task 2 ครบทั้งหมด (ไม่มี Edge Function จึงไม่มีส่วน deferred)
- **Placeholder scan:** ไม่มี TBD/TODO
- **Type consistency:** `Stats` type ครอบคลุมทุกตัวเลขที่ query จริง ใช้ตรงกันทั้งใน `setStats()` และ JSX rendering
- **Middleware:** ไม่มี task แก้ `lib/supabase/middleware.ts` เพราะ prefix `/dashboard` ตรงกับ path เป้าหมายเป๊ะ (exact match ของ longest-prefix) — ตรวจยืนยันด้วย Task 2 Step 4
- **Route-group directory bug (Track B lesson):** เพิ่มคำเตือนใน Task 1 ให้ตรวจ `ls "app/(app)/dashboard/"` ก่อน-หลังสร้างไฟล์ (กรณีนี้ต่างจาก sub-project ก่อนหน้าตรงที่สร้างแค่ไฟล์ ไม่ใช่ไดเรกทอรีย่อยใหม่ ความเสี่ยงบั๊กนี้จึงต่ำกว่ามาก แต่ยังคงเตือนไว้เพื่อความสม่ำเสมอ)
- **ลิงก์ไปหน้าที่ยังไม่มีอยู่จริง:** ระบุไว้ชัดเจนใน Global Constraints และ Task 2 Step 3 ว่าเป็นเรื่องปกติ ไม่ใช่บั๊ก
