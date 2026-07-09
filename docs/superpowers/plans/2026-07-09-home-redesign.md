# Home Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนหน้า `/home` จากการ์ดต้อนรับเปล่าๆ เป็นแดชบอร์ดส่วนตัวแบบ role-aware พร้อมแถบตารางองค์กร "สัปดาห์นี้"

**Architecture:** แยก logic วันที่ของแถบสัปดาห์เป็น pure module `lib/homeWeek.ts` (ทดสอบด้วย Vitest) แล้วเขียนหน้า `app/(app)/home/page.tsx` ใหม่เป็น client component ที่โหลดข้อมูล role-aware ฝั่ง client (อ่านอย่างเดียวจาก view/table เดิม ไม่มี migration/Edge Function/RLS ใหม่) reuse Card/Badge/Avatar/Skeleton + design token เดิม

**Tech Stack:** Next.js 16 App Router (client component), TypeScript, Tailwind v4 (CSS-first tokens), Supabase JS client, Vitest

## Global Constraints

- ใช้ **เฉพาะ design token / Tailwind utility ที่ map จาก token** — ห้าม hardcode สี/spacing/font (CLAUDE.md ข้อ 10)
- ข้อความ UI ทั้งหมดเป็น **ภาษาไทยทางการ** (CLAUDE.md ข้อ 9)
- **ไม่สร้าง** migration / Edge Function / RLS policy ใหม่ — อ่านข้อมูลอย่างเดียว
- แหล่งข้อมูลที่ใช้ได้ (ยืนยันจากโค้ดที่ทำงานจริง): `booking_detail` (มี `id, ref_id, title, final_status, start_time, end_time, room_name, requester_name, requester_id, created_at`; ทุก role อ่านทั้งองค์กรได้), `bookings`, `system_config` (`admin_id, approver1_id, approver2_id`)
- Approval Chain step: `admin_id→1, approver1_id→2, approver2_id→3`; งานที่รอ step หนึ่ง = `bookings` ที่ `final_status='pending'` และ `current_step = step - 1` (ตรงกับ `app/(app)/approver/page.tsx`)
- สัปดาห์เริ่ม **วันอาทิตย์** (ปฏิทินไทย); label = `["อา","จ","อ","พ","พฤ","ศ","ส"]` index ตาม `Date.getDay()`
- ตัวเลขทั้งหมดฟอร์แมตด้วย `toLocaleString("th-TH")`
- ROLE label ภาษาไทย: `user→ผู้ใช้ทั่วไป, approver→ผู้อนุมัติ, admin→ผู้ดูแลระบบ`
- Vitest ครอบ `lib/**/*.test.ts` อยู่แล้ว (`vitest.config.ts`) — ไม่ต้องแก้ config

---

### Task 1: lib/homeWeek.ts — pure date logic + unit tests

**Files:**
- Create: `lib/homeWeek.ts`
- Test: `lib/homeWeek.test.ts`

**Interfaces:**
- Consumes: ไม่มี (pure, ไม่พึ่ง React/Supabase)
- Produces:
  - `THAI_WEEKDAY_LABELS: readonly string[]` (7 ตัว index ตาม getDay)
  - `type WeekDay = { date: Date; label: string; dayOfMonth: number; isToday: boolean; count: number }`
  - `buildWeekDays(now: Date): WeekDay[]` (7 วัน เริ่มอาทิตย์, count เริ่ม 0)
  - `weekRangeISO(now: Date): { startISO: string; endISO: string }`
  - `bucketByDay(days: WeekDay[], bookings: { start_time: string }[]): WeekDay[]`

- [ ] **Step 1: Write the failing test**

สร้าง `lib/homeWeek.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  THAI_WEEKDAY_LABELS,
  buildWeekDays,
  weekRangeISO,
  bucketByDay,
} from "./homeWeek";

// อ้างอิงเวลาแบบ local — เลือกเที่ยงวันเพื่อเลี่ยงขอบเขตวัน
const NOW = new Date(2026, 6, 8, 12, 0, 0); // 8 ก.ค. 2026, 12:00 local

describe("buildWeekDays", () => {
  it("คืน 7 วัน เริ่มวันอาทิตย์", () => {
    const days = buildWeekDays(NOW);
    expect(days).toHaveLength(7);
    expect(days[0].date.getDay()).toBe(0); // อาทิตย์
    expect(days[6].date.getDay()).toBe(6); // เสาร์
  });

  it("label ตรงกับ getDay ของวันนั้น", () => {
    const days = buildWeekDays(NOW);
    for (const d of days) {
      expect(d.label).toBe(THAI_WEEKDAY_LABELS[d.date.getDay()]);
    }
  });

  it("มี isToday เป็น true เพียงวันเดียว และตรงกับวันของ now", () => {
    const days = buildWeekDays(NOW);
    const todays = days.filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].dayOfMonth).toBe(8);
  });

  it("count เริ่มต้นเป็น 0 ทุกวัน", () => {
    expect(buildWeekDays(NOW).every((d) => d.count === 0)).toBe(true);
  });
});

describe("weekRangeISO", () => {
  it("ช่วงยาว 7 วันพอดี และเริ่มเที่ยงคืนวันอาทิตย์", () => {
    const { startISO, endISO } = weekRangeISO(NOW);
    const start = new Date(startISO);
    const end = new Date(endISO);
    expect(start.getDay()).toBe(0);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(7 * 86400000);
  });
});

describe("bucketByDay", () => {
  const at = (d: Date, h: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString();

  it("นับหลายรายการในวันเดียวกันรวมถูก และข้ามรายการนอกช่วง", () => {
    const days = buildWeekDays(NOW);
    const beforeWeek = new Date(
      days[0].date.getFullYear(),
      days[0].date.getMonth(),
      days[0].date.getDate() - 1,
      10
    ).toISOString();
    const bookings = [
      { start_time: at(days[2].date, 9) },
      { start_time: at(days[2].date, 14) },
      { start_time: at(days[5].date, 10) },
      { start_time: beforeWeek }, // นอกช่วง ต้องถูกข้าม
    ];
    const result = bucketByDay(days, bookings);
    expect(result[2].count).toBe(2);
    expect(result[5].count).toBe(1);
    expect(result[0].count).toBe(0);
    expect(result.reduce((s, d) => s + d.count, 0)).toBe(3);
  });

  it("คืน array ใหม่ ไม่แก้ของเดิม", () => {
    const days = buildWeekDays(NOW);
    const result = bucketByDay(days, [{ start_time: at(days[1].date, 9) }]);
    expect(days[1].count).toBe(0); // ของเดิมไม่เปลี่ยน
    expect(result[1].count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/homeWeek.test.ts`
Expected: FAIL — `Failed to resolve import "./homeWeek"` (ยังไม่มีไฟล์)

- [ ] **Step 3: Write minimal implementation**

สร้าง `lib/homeWeek.ts`:

```ts
// Pure date helpers สำหรับแถบ "สัปดาห์นี้" ในหน้า /home
// สัปดาห์เริ่มวันอาทิตย์ตามปฏิทินไทย ไม่พึ่ง React/Supabase เพื่อ unit-test ได้

export const THAI_WEEKDAY_LABELS = [
  "อา",
  "จ",
  "อ",
  "พ",
  "พฤ",
  "ศ",
  "ส",
] as const;

export type WeekDay = {
  date: Date; // เที่ยงคืน (local) ของวันนั้น
  label: string;
  dayOfMonth: number;
  isToday: boolean;
  count: number;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(now: Date): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() - d.getDay()); // ย้อนไปวันอาทิตย์
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function buildWeekDays(now: Date): WeekDay[] {
  const start = startOfWeek(now);
  const today = startOfDay(now);
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i
    );
    days.push({
      date,
      label: THAI_WEEKDAY_LABELS[date.getDay()],
      dayOfMonth: date.getDate(),
      isToday: isSameDay(date, today),
      count: 0,
    });
  }
  return days;
}

export function weekRangeISO(now: Date): { startISO: string; endISO: string } {
  const start = startOfWeek(now);
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 7
  );
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function bucketByDay(
  days: WeekDay[],
  bookings: { start_time: string }[]
): WeekDay[] {
  const result = days.map((d) => ({ ...d, count: 0 }));
  if (result.length === 0) return result;
  const weekStart = startOfDay(result[0].date);
  for (const b of bookings) {
    const bDay = startOfDay(new Date(b.start_time));
    const diffDays = Math.round(
      (bDay.getTime() - weekStart.getTime()) / 86400000
    );
    if (diffDays >= 0 && diffDays < 7) {
      result[diffDays].count += 1;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/homeWeek.test.ts`
Expected: PASS — 7 tests passed

- [ ] **Step 5: Commit**

```bash
git add lib/homeWeek.ts lib/homeWeek.test.ts
git commit -m "feat: add lib/homeWeek — pure week-strip date helpers + tests"
```

---

### Task 2: เขียนหน้า /home ใหม่ (client component)

**Files:**
- Modify (rewrite ทั้งไฟล์): `app/(app)/home/page.tsx`

**Interfaces:**
- Consumes จาก Task 1: `buildWeekDays`, `weekRangeISO`, `bucketByDay`, `type WeekDay` จาก `@/lib/homeWeek`
- Consumes (มีอยู่แล้ว): `Card` (`@/components/ui/Card`, prop `padding?`, `className?`), `Badge` (`@/components/ui/Badge`, prop `tone: "success"|"warning"|"danger"|"neutral"`), `Avatar` (`@/components/ui/Avatar`, prop `name`, `size?: "sm"|"md"|"lg"`, `tone?: "solid"|"inverse"`), `Skeleton` (`@/components/ui/Skeleton`, prop `className?`), `createClient` (`@/lib/supabase/client`)
- Produces: default export React component (หน้า route `/home`)

- [ ] **Step 1: Rewrite the page**

เขียนทับ `app/(app)/home/page.tsx` ทั้งไฟล์ด้วยโค้ดนี้:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  buildWeekDays,
  weekRangeISO,
  bucketByDay,
  type WeekDay,
} from "@/lib/homeWeek";

type Role = "user" | "approver" | "admin";

const ROLE_LABEL: Record<string, string> = {
  user: "ผู้ใช้ทั่วไป",
  approver: "ผู้อนุมัติ",
  admin: "ผู้ดูแลระบบ",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
};

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> =
  {
    pending: "warning",
    approved: "success",
  };

type NextBooking = {
  id: string;
  title: string;
  room_name: string;
  start_time: string;
  end_time: string;
  final_status: string;
};

type HomeData = {
  fullName: string;
  role: Role;
  nextBooking: NextBooking | null;
  myPendingCount: number;
  weekDays: WeekDay[];
  waitingCount: number | null; // null = ไม่ได้อยู่ใน Approval Chain
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        return;
      }

      const now = new Date();
      const { startISO, endISO } = weekRangeISO(now);

      const [profileRes, nextRes, pendingRes, weekRes, configRes] =
        await Promise.all([
          supabase
            .from("users")
            .select("full_name, role")
            .eq("id", user.id)
            .single(),
          supabase
            .from("booking_detail")
            .select("id, title, room_name, start_time, end_time, final_status")
            .eq("requester_id", user.id)
            .in("final_status", ["approved", "pending"])
            .gte("start_time", now.toISOString())
            .order("start_time", { ascending: true })
            .limit(1),
          supabase
            .from("booking_detail")
            .select("id", { count: "exact", head: true })
            .eq("requester_id", user.id)
            .eq("final_status", "pending"),
          supabase
            .from("booking_detail")
            .select("start_time")
            .in("final_status", ["approved", "pending"])
            .gte("start_time", startISO)
            .lt("start_time", endISO),
          supabase
            .from("system_config")
            .select("admin_id, approver1_id, approver2_id")
            .single(),
        ]);

      if (profileRes.error || !profileRes.data) {
        setLoadError("ไม่สามารถโหลดข้อมูลหน้าหลักได้");
        return;
      }

      const role = (profileRes.data.role ?? "user") as Role;

      // "รอคุณพิจารณา" ผูกกับการเป็นสมาชิก Approval Chain (มี step) ไม่ใช่ role
      let myStep: number | null = null;
      const cfg = configRes.data;
      if (cfg) {
        if (cfg.admin_id === user.id) myStep = 1;
        else if (cfg.approver1_id === user.id) myStep = 2;
        else if (cfg.approver2_id === user.id) myStep = 3;
      }

      let waitingCount: number | null = null;
      if (myStep !== null) {
        const { count } = await supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("final_status", "pending")
          .eq("current_step", myStep - 1);
        waitingCount = count ?? 0;
      }

      const weekBookings = (weekRes.data ?? []) as { start_time: string }[];
      const weekDays = bucketByDay(buildWeekDays(now), weekBookings);

      setData({
        fullName: profileRes.data.full_name,
        role,
        nextBooking: (nextRes.data?.[0] ?? null) as NextBooking | null,
        myPendingCount: pendingRes.count ?? 0,
        weekDays,
        waitingCount,
      });
    }

    load();
  }, []);

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-danger-text">{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in-up space-y-4 p-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const emptyWeek = data.weekDays.every((d) => d.count === 0);

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      {/* Header แบรนด์ */}
      <div className="overflow-hidden rounded-lg shadow-card">
        <div
          className="flex items-center gap-4 p-5"
          style={{ background: "var(--gradient-brand)" }}
        >
          <Avatar name={data.fullName} size="lg" tone="inverse" />
          <div className="min-w-0">
            <p className="text-sm text-text-on-primary opacity-90">
              ยินดีต้อนรับ
            </p>
            <p className="truncate text-lg font-semibold text-text-on-primary">
              {data.fullName}
            </p>
            <span className="mt-2 inline-block rounded-pill bg-surface-card px-2.5 py-0.5 text-xs font-semibold text-brand-primary">
              {ROLE_LABEL[data.role] ?? data.role}
            </span>
          </div>
        </div>
      </div>

      {/* การ์ดสถานะของฉัน */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-text-secondary">การจองถัดไปของฉัน</p>
          {data.nextBooking ? (
            <div className="mt-1">
              <p className="font-medium text-text-primary">
                {data.nextBooking.title}
              </p>
              <p className="text-sm text-text-secondary">
                ห้อง {data.nextBooking.room_name}
              </p>
              <p className="text-sm text-text-secondary">
                {formatDateTime(data.nextBooking.start_time)}
              </p>
              <div className="mt-1">
                <Badge tone={STATUS_TONE[data.nextBooking.final_status] ?? "neutral"}>
                  {STATUS_LABEL[data.nextBooking.final_status] ??
                    data.nextBooking.final_status}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm text-text-muted">
              ยังไม่มีการจองที่กำลังจะถึง
            </p>
          )}
        </Card>

        <Card>
          <p className="text-sm text-text-secondary">คำขอที่รออนุมัติของฉัน</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">
            {data.myPendingCount.toLocaleString("th-TH")}
          </p>
          <Link
            href="/booking"
            className="mt-3 inline-block rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary transition-transform duration-150 hover:scale-[1.02] hover:bg-brand-primary-strong"
          >
            จองห้องประชุม
          </Link>
        </Card>
      </div>

      {/* การ์ดตามบทบาท */}
      {(data.waitingCount !== null || data.role === "admin") && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.waitingCount !== null && (
            <Link
              href="/approver"
              className="flex flex-col gap-0.5 rounded-lg border border-warning-border bg-warning-surface p-5 shadow-card transition-shadow duration-150 hover:shadow-raised"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-text-secondary">
                  รอคุณพิจารณา
                </span>
                <span className="text-xs text-warning-text opacity-85">
                  ไปหน้าคำขออนุมัติ →
                </span>
              </div>
              <span className="text-2xl font-semibold text-warning-text">
                {data.waitingCount.toLocaleString("th-TH")}
              </span>
            </Link>
          )}
          {data.role === "admin" && (
            <Link
              href="/dashboard"
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-surface-card p-5 shadow-card transition-shadow duration-150 hover:shadow-raised"
            >
              <span className="font-medium text-text-primary">ภาพรวมระบบ</span>
              <span className="text-sm text-brand-primary">ดูสถิติ →</span>
            </Link>
          )}
        </div>
      )}

      {/* แถบสัปดาห์นี้ (องค์กร) */}
      <Card className="mt-4">
        <p className="text-sm font-medium text-text-primary">
          ตารางการจองสัปดาห์นี้
        </p>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {data.weekDays.map((d, i) => (
            <div
              key={i}
              className={`rounded-sm p-2 text-center ${
                d.isToday ? "bg-nav-active-surface" : ""
              }`}
            >
              <p className="text-xs text-text-secondary">{d.label}</p>
              <p
                className={`text-sm ${
                  d.isToday
                    ? "font-semibold text-text-primary"
                    : "text-text-primary"
                }`}
              >
                {d.dayOfMonth}
              </p>
              {d.count > 0 ? (
                <p className="text-xs font-semibold text-brand-primary">
                  {d.count.toLocaleString("th-TH")}
                </p>
              ) : (
                <p className="text-xs text-text-muted">—</p>
              )}
            </div>
          ))}
        </div>
        {emptyWeek && (
          <p className="mt-2 text-xs text-text-muted">
            ยังไม่มีการจองในสัปดาห์นี้
          </p>
        )}
        <Link
          href="/calendar"
          className="mt-3 inline-block text-sm text-brand-primary hover:underline"
        >
          ดูปฏิทินทั้งหมด →
        </Link>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: ไม่มี output (ผ่าน)

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build สำเร็จ ไม่มี error (หน้า `/home` compile ผ่าน)

- [ ] **Step 4: Live verification (preview, local dev)**

รัน dev server แล้วทดสอบทั้ง 3 role — **clear cookie `sb-*` ก่อน login ทุกครั้ง** กัน session ค้าง:

1. `user@test.local`: header โชว์ชื่อ + badge "ผู้ใช้ทั่วไป"; การ์ด "การจองถัดไปของฉัน" + "คำขอที่รออนุมัติของฉัน" + ปุ่ม "จองห้องประชุม"; แถบสัปดาห์ 7 วัน วันนี้ไฮไลต์พื้น `#e4f3ea`, ตัวเลของค์กรตรงกับข้อมูล; ปุ่ม "ดูปฏิทินทั้งหมด →"; **ไม่มี** การ์ด "รอคุณพิจารณา" และ "ภาพรวมระบบ"
2. `approver1@test.local`: **มี** การ์ด "รอคุณพิจารณา N"; **ไม่มี** "ภาพรวมระบบ"
3. `admin@test.local`: **มี** ทั้ง "รอคุณพิจารณา N" และ "ภาพรวมระบบ" (→ /dashboard)
4. ตรวจว่า badge role เป็นภาษาไทย (ไม่ใช่ `user`/`admin` ดิบ) และปุ่ม/ลิงก์ทุกอันไปหน้าถูกต้อง (`/booking`, `/approver`, `/dashboard`, `/calendar`)

Expected: ทุกข้อผ่าน, ไม่มี console error

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/home/page.tsx"
git commit -m "feat: redesign /home — role-aware personal dashboard + org week strip"
```

---

## Self-Review

**1. Spec coverage:**
- Header แบรนด์ + role ไทย → Task 2 header block ✓
- การจองถัดไป / pending count / ปุ่มจอง → Task 2 status cards ✓
- "รอคุณพิจารณา" (chain-based) → Task 2 role cards + waitingCount logic ✓
- admin "ภาพรวมระบบ" → Task 2 role cards ✓
- แถบสัปดาห์องค์กร + วันนี้ไฮไลต์ + empty-day "—" + empty-week message → Task 2 week strip + Task 1 bucketByDay ✓
- ปุ่มไป /calendar → Task 2 ✓
- pure module + unit test → Task 1 ✓
- loading Skeleton / error state → Task 2 early returns ✓
- ไม่มี migration/Edge Function/RLS → ยืนยัน อ่านอย่างเดียว ✓
- live test 3 role → Task 2 Step 4 ✓

**2. Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีโค้ด/คำสั่งจริง ✓

**3. Type consistency:** `WeekDay`, `buildWeekDays`, `weekRangeISO`, `bucketByDay` ที่ประกาศใน Task 1 ตรงกับที่ import/ใช้ใน Task 2 ✓; `HomeData.waitingCount: number | null` สอดคล้องกับเงื่อนไข render `!== null` ✓
