# Track D (sub-project 3) — ประวัติการทำงานรวม Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า `/dashboard/activity` ให้ Admin เห็นประวัติการทำงานรวมของทุกคนในระบบ (อนุมัติ, ปฏิเสธ, ยกเลิก, เปลี่ยนการตั้งค่า) พร้อม filter ตามประเภทเหตุการณ์และ pagination

**Architecture:** หน้าเดียว read-only ทั้งหมด query `staff_activity_timeline` view ที่มีอยู่แล้ว (UNION ของ 3 ตาราง, `security_invoker=true`) ตรงจาก Supabase browser client — ไม่มี Edge Function เพราะไม่มีการเขียนข้อมูล

**Tech Stack:** Next.js 16 App Router (client component), `@supabase/supabase-js@2`

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10) — ใช้ class จาก `docs/DESIGN.md` เท่านั้น
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9)
- **ต้องระบุ `.order("occurred_at", { ascending: false })` ชัดเจนในฝั่ง client เสมอ** แม้ `staff_activity_timeline` view จะมี `ORDER BY` ท้ายสุดในตัวเองอยู่แล้ว (migration 012) — Postgres ไม่การันตีว่า query ผ่าน view จะรักษาลำดับจาก view definition เดิมถ้าไม่ระบุ ORDER BY ตอน query จริง
- **ไม่ต้องแก้ `lib/supabase/middleware.ts`** — prefix `/dashboard` → `["admin"]` ที่มีอยู่แล้วครอบคลุม `/dashboard/activity` ผ่าน longest-prefix matching
- **ไม่มี Edge Function ในสโคปนี้** — หน้านี้ read-only ทั้งหมด ไม่มีการเขียนข้อมูล จึงไม่มี task deploy/verify_jwt ในแผนนี้
- **ไม่ต้องเพิ่ม `"supabase/functions"` เข้า tsconfig.json exclude อีก** — ทำไปแล้วในเวิร์กทรีนี้ตั้งแต่ sub-project 1

## File Structure

| File | หน้าที่ |
|---|---|
| `app/(app)/dashboard/activity/page.tsx` | หน้าประวัติการทำงานรวม + filter event_type + pagination |

---

### Task 1: หน้า `/dashboard/activity`

**Files:**
- Create: `app/(app)/dashboard/activity/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`
- Produces: route `/dashboard/activity`

**คำเตือนสำคัญ:** สร้างไดเรกทอรีด้วยชื่อ `app/(app)/dashboard/activity/` ให้ตรงเป๊ะ (วงเล็บเปิด-ปิดชิดกัน `(app)` ไม่มี `/` แทรก) — ไดเรกทอรี `app/(app)/dashboard/` มีอยู่แล้ว (มี `rooms/`, `users/`, `settings/`, `bookings/` จาก sub-project ก่อนหน้า) ใช้ `mkdir -p "app/(app)/dashboard/activity"` เป็นคำสั่งเดียว **ห้ามสร้างไดเรกทอรี `(app)` ใหม่**

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ActivityRow = {
  id: string;
  event_type: "approval" | "cancellation" | "config_change";
  sub_type: string;
  actor_name: string;
  related_ref: string | null;
  detail: string | null;
  occurred_at: string;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  approval: "การอนุมัติ",
  cancellation: "การยกเลิก",
  config_change: "การตั้งค่า",
};

function getEventLabel(eventType: string, subType: string): string {
  if (eventType === "approval" && subType === "approved") {
    return "อนุมัติคำขอจอง";
  }
  if (eventType === "approval" && subType === "rejected") {
    return "ปฏิเสธคำขอจอง";
  }
  if (eventType === "cancellation" && subType === "user_cancel") {
    return "ผู้ใช้ยกเลิกการจอง";
  }
  if (eventType === "cancellation" && subType === "staff_cancel") {
    return "เจ้าหน้าที่ยกเลิกการจอง";
  }
  return subType;
}

const PAGE_SIZE = 20;

export default function DashboardActivityPage() {
  const [entries, setEntries] = useState<ActivityRow[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadActivity() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("staff_activity_timeline")
      .select(
        "id, event_type, sub_type, actor_name, related_ref, detail, occurred_at",
        { count: "exact" }
      )
      .order("occurred_at", { ascending: false })
      .range(from, to);

    if (eventTypeFilter) {
      query = query.eq("event_type", eventTypeFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      setLoadError("ไม่สามารถโหลดประวัติการทำงานได้");
      setLoading(false);
      return;
    }

    setEntries((data ?? []) as ActivityRow[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, eventTypeFilter]);

  function handleFilterChange(value: string) {
    setEventTypeFilter(value);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการทำงานรวม
      </h1>

      <div className="mt-4">
        <select
          value={eventTypeFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
        >
          <option value="">ทั้งหมด</option>
          <option value="approval">{EVENT_TYPE_LABEL.approval}</option>
          <option value="cancellation">{EVENT_TYPE_LABEL.cancellation}</option>
          <option value="config_change">
            {EVENT_TYPE_LABEL.config_change}
          </option>
        </select>
      </div>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}

      {!loading && entries.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่พบประวัติการทำงาน
        </p>
      )}

      <div className="mt-4 space-y-3">
        {entries.map((e) => (
          <div
            key={e.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">
              {getEventLabel(e.event_type, e.sub_type)}
            </p>
            <p className="text-sm text-text-secondary">
              โดย {e.actor_name}
              {e.related_ref && ` — ${e.related_ref}`}
            </p>
            {e.detail && (
              <p className="text-sm text-text-secondary">{e.detail}</p>
            )}
            <p className="mt-1 text-sm text-text-secondary">
              {new Date(e.occurred_at).toLocaleString("th-TH")}
            </p>
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
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ, route list มี `/dashboard/activity` (ตรวจด้วย `ls "app/(app)/dashboard/activity/"` ก่อนด้วยว่ามีแค่ไฟล์นี้ ไม่มีไดเรกทอรี `(app` หรือ `(app/)` แปลกปลอมเกิดขึ้น)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dashboard/activity/page.tsx"
git commit -m "feat: add dashboard activity log page with event type filter and pagination"
```

---

### Task 2: Manual Verification

**Files:** ไม่มี (verification เท่านั้น)

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, route list มี `/dashboard/activity`

- [ ] **Step 2: ทดสอบ `/dashboard/activity` — login เป็น admin**

`npm run dev`, login ด้วย `admin@test.local`, เข้า `/dashboard/activity`
Expected: เห็น event จาก seed data (`approval_logs` ของ Booking 1-4) เรียงตามเวลาล่าสุดก่อน — เห็นทั้งของ Admin และ Approver1/2 (ไม่ filter ตามตัวเอง เพราะเป็น Admin)

- [ ] **Step 3: ทดสอบ filter event_type**

เลือก "การอนุมัติ" จาก dropdown
Expected: เห็นเฉพาะ event ประเภท `approval` — เลือก "ทั้งหมด" กลับมาเห็นครบ

- [ ] **Step 4: ทดสอบ pagination**

ตรวจสถานะปุ่ม "ถัดไป"/"ก่อนหน้า" ตามจำนวนข้อมูลจริง (ถ้ามีน้อยกว่า 20 รายการ ปุ่ม "ถัดไป" ต้อง disabled)

- [ ] **Step 5: ทดสอบ middleware gate**

Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard/activity` ตรงๆ ทาง URL
Expected: ถูก middleware redirect ไป `/home` ทันที (ครอบคลุมด้วย `/dashboard` prefix อยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)

หมายเหตุ: ไม่มี Edge Function ในสโคปนี้ ดังนั้นทุกข้อทดสอบได้ในเซสชันนี้ทั้งหมด ไม่มีส่วนที่ต้อง deferred ไปให้ผู้ใช้ deploy

---

## Self-Review Notes

- **Spec coverage:** หน้า `/dashboard/activity` (filter+pagination+label mapping) → Task 1 ครบทุกข้อในสเปค, success criteria ทั้ง 5 ข้อ → Task 2 ครบทั้งหมด (ไม่มี Edge Function จึงไม่มีส่วน deferred)
- **Placeholder scan:** ไม่มี TBD/TODO
- **Type consistency:** `ActivityRow` type ตรงกับ column ที่ query จริงจาก `staff_activity_timeline` (ยืนยันจาก migration 012: `id, event_type, sub_type, actor_id, actor_name, related_id, related_ref, detail, occurred_at`)
- **Middleware:** ไม่มี task แก้ `lib/supabase/middleware.ts` เพราะ prefix `/dashboard` ครอบคลุมอยู่แล้ว — ตรวจยืนยันด้วย Task 2 Step 5
- **Route-group directory bug (Track B lesson):** เพิ่มคำเตือนใน Task 1 ให้ตรวจ `ls "app/(app)/..."` หลังสร้างไฟล์
- **ORDER BY gotcha:** ระบุไว้ชัดเจนใน Global Constraints และในโค้ด Task 1 ว่าต้อง `.order()` ชัดเจนแม้ view จะมี ORDER BY ในตัวเองแล้ว
