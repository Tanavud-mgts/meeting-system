# Track D (sub-project 7, ส่วนสุดท้าย) — First-time Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้างหน้า `/setup` wizard 4 ขั้นตอนให้ Admin ตั้งค่าระบบครั้งแรก (เพิ่มห้อง, Approval Chain, business hours) พร้อม middleware auto-redirect เมื่อยังไม่ได้ตั้งค่า

**Architecture:** หน้า `/setup` เป็น client component เดียวจัดการ 4 ขั้นตอนด้วย local state, Edge Function ใหม่ `complete-setup` ตั้ง flag เสร็จ, middleware เพิ่มเงื่อนไข auto-redirect เฉพาะ prefix `/dashboard` เมื่อ role เป็น admin และยังไม่ตั้งค่า

**Tech Stack:** Next.js 16 App Router (client component, `next/navigation`'s `useRouter`), Supabase Edge Function (Deno), `@supabase/supabase-js@2`, Next.js Middleware

## Global Constraints

- **Design tokens เท่านั้น** (CLAUDE.md กฎข้อ 10)
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md กฎข้อ 9)
- **ทุก Edge Function ห่อด้วย `withErrorHandling()`** จาก `_shared/handler.ts`, throw `AppError` subclass จาก `_shared/errors.ts` เท่านั้น (CLAUDE.md กฎข้อ 1)
- **ทุก `fetch()` ไปยัง Edge Function จาก client ต้องห่อด้วย `try/catch/finally` เสมอ** (บทเรียนจาก sub-project 1's final review)
- **ไม่แก้ไข Edge Function `update-approval-chain`** — ใช้ตามเดิม (ทดสอบผ่านแล้วใน sub-project 1)
- **ห้องเพิ่มผ่าน client ตรง ไม่ต้องผ่าน Edge Function** — RLS policy `"rooms: admin write"` อนุญาต admin insert ตรงอยู่แล้ว
- **`complete-setup` ต้องเป็น admin เท่านั้น** — ตรวจ role จากตาราง `users` เหมือน Edge Function อื่นในโปรเจกต์ (dual-client pattern)
- **Middleware change จำกัดเฉพาะ prefix `/dashboard`** — ไม่บังคับกับ `/home`/`/booking`/`/calendar`/`/profile`/`/approver`
- **Middleware ต้อง fail-open** — ถ้า query `system_config` ล้มเหลวหรือไม่พบแถว ห้าม redirect บังคับ (ไม่ให้ query เดียวพังทั้งแอป)
- **ไม่มี Deno CLI / Supabase CLI / Supabase MCP ในเซสชันนี้** — Edge Function `.ts` verify ด้วย manual code review + `npx tsc --noEmit`/`npm run build` เท่านั้น
- **ไม่สามารถทดสอบ auto-redirect end-to-end ในเซสชันนี้ได้** — seed data ตั้ง `setup_completed=true` เสมอ ไม่มีทางแก้ไขค่านี้ในเซสชันนี้ (deferred ให้ผู้ใช้หลัง deploy)

## File Structure

| File | หน้าที่ |
|---|---|
| `supabase/functions/complete-setup/index.ts` | Edge Function ตั้ง `system_config.setup_completed = true` |
| `supabase/config.toml` | เพิ่ม `[functions.complete-setup]` พร้อม `verify_jwt=true` |
| `lib/supabase/middleware.ts` | เพิ่มเงื่อนไข auto-redirect ไป `/setup` |
| `app/setup/page.tsx` | หน้า wizard 4 ขั้นตอน |

---

### Task 1: `complete-setup` Edge Function

**Files:**
- Create: `supabase/functions/complete-setup/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `withErrorHandling()` จาก `../_shared/handler.ts`, `ForbiddenError`/`UnauthorizedError`/`ValidationError` จาก `../_shared/errors.ts`
- Produces: HTTP endpoint `POST /functions/v1/complete-setup` (ไม่มี body) คืน `{ success: true }`

- [ ] **Step 1: สร้างไฟล์**

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../_shared/errors.ts";

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
      throw new ForbiddenError("ท่านไม่มีสิทธิ์ดำเนินการนี้");
    }

    const { data: config, error: configError } = await adminClient
      .from("system_config")
      .select("id")
      .single();

    if (configError || !config) {
      throw new ValidationError("ไม่พบข้อมูลการตั้งค่าระบบ");
    }

    const { error: updateError } = await adminClient
      .from("system_config")
      .update({ setup_completed: true })
      .eq("id", config.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: เพิ่ม declarative config ใน `supabase/config.toml`**

หาบรรทัดสุดท้ายของไฟล์ (`[functions.cleanup-logs-now]` block จาก sub-project 5) แล้วเพิ่มต่อท้ายไฟล์:

```toml

[functions.complete-setup]
verify_jwt = true
```

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/complete-setup/index.ts supabase/config.toml
git commit -m "feat: add complete-setup edge function"
```

---

### Task 2: Middleware auto-redirect

**Files:**
- Modify: `lib/supabase/middleware.ts`

**Interfaces:**
- Consumes: ไม่มี interface ใหม่ — แก้ไขฟังก์ชัน `updateSession()` ที่มีอยู่แล้ว
- Produces: พฤติกรรม redirect เพิ่มเติมสำหรับ admin ที่ `setup_completed=false` เข้า `/dashboard/*`

**คำเตือนสำคัญ:** ไฟล์นี้เป็น shared middleware ที่ใช้ทั่วทั้งแอป (ทุก Track A/B/C/D) — ต้องแก้เฉพาะจุดที่ระบุ ห้ามเปลี่ยนแปลงพฤติกรรมเดิมของ `matchRoute()` หรือ role-gate logic ที่มีอยู่แล้ว

- [ ] **Step 1: อ่านไฟล์ปัจจุบันเพื่อยืนยันเนื้อหาก่อนแก้**

ไฟล์ปัจจุบัน (77 บรรทัด) มีโครงสร้างดังนี้:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROUTE_ROLES: Record<string, string[]> = {
  "/setup": ["admin"],
  "/dashboard": ["admin"],
  "/dashboard/reports": ["approver", "admin"],
  "/approver": ["approver", "admin"],
  "/home": ["user", "approver", "admin"],
  "/booking": ["user", "approver", "admin"],
  "/calendar": ["user", "approver", "admin"],
  "/profile": ["user", "approver", "admin"],
};

function matchRoute(pathname: string): string[] | null {
  let bestMatch: { prefix: string; roles: string[] } | null = null;

  for (const [prefix, roles] of Object.entries(ROUTE_ROLES)) {
    if (
      pathname.startsWith(prefix) &&
      (!bestMatch || prefix.length > bestMatch.prefix.length)
    ) {
      bestMatch = { prefix, roles };
    }
  }

  return bestMatch ? bestMatch.roles : null;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requiredRoles = matchRoute(request.nextUrl.pathname);

  if (requiredRoles) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !requiredRoles.includes(profile.role)) {
      return NextResponse.redirect(new URL("/home", request.url));
    }
  }

  return response;
}
```

- [ ] **Step 2: แก้ไขบล็อก `if (requiredRoles)` เพื่อเพิ่มเงื่อนไข setup_completed**

แทนที่บล็อกนี้:

```ts
  if (requiredRoles) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !requiredRoles.includes(profile.role)) {
      return NextResponse.redirect(new URL("/home", request.url));
    }
  }

  return response;
}
```

ด้วย:

```ts
  if (requiredRoles) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !requiredRoles.includes(profile.role)) {
      return NextResponse.redirect(new URL("/home", request.url));
    }

    if (
      profile.role === "admin" &&
      request.nextUrl.pathname.startsWith("/dashboard")
    ) {
      const { data: config } = await supabase
        .from("system_config")
        .select("setup_completed")
        .single();

      if (config && config.setup_completed === false) {
        return NextResponse.redirect(new URL("/setup", request.url));
      }
    }
  }

  return response;
}
```

(ไฟล์ส่วนบน — `import`, `ROUTE_ROLES`, `matchRoute()`, และการสร้าง `supabase` client — คงเดิมทั้งหมด ไม่แก้ไข)

- [ ] **Step 3: ตรวจว่า type-check + build ผ่าน**

Run: `npx tsc --noEmit && npm run build`
Expected: ทั้งสองคำสั่งผ่าน

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/middleware.ts
git commit -m "feat: redirect admin to /setup when system setup is incomplete"
```

---

### Task 3: หน้า `/setup`

**Files:**
- Create: `app/setup/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client`, `useRouter()` จาก `next/navigation`, Edge Functions `update-approval-chain` (มีอยู่แล้วจาก sub-project 1) และ `complete-setup` (Task 1)
- Produces: route `/setup`

**คำเตือนสำคัญ:** หน้านี้อยู่ที่ `app/setup/page.tsx` **ไม่ใช่** `app/(app)/setup/page.tsx` — เพราะ `/setup` ไม่ได้อยู่ในกลุ่ม authenticated layout ที่มี nav bar (Admin ต้องเห็นหน้านี้แบบเต็มจอไม่มี sidebar รบกวนระหว่างตั้งค่าระบบครั้งแรก) ตรวจสอบ `ls "app/"` ก่อนสร้าง — ต้องเห็น `(app)/`, `login/`, `layout.tsx`, `page.tsx` อยู่แล้ว สร้างไดเรกทอรีใหม่ `app/setup/` ด้วยคำสั่งเดียว `mkdir -p "app/setup"` **ห้ามสร้างภายใต้ `app/(app)/`**

- [ ] **Step 1: สร้างไฟล์**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Room = {
  id: string;
  name: string;
  capacity: number;
};

type ChainUser = {
  id: string;
  full_name: string;
};

export default function SetupWizardPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoadError, setRoomsLoadError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("");
  const [roomFormError, setRoomFormError] = useState<string | null>(null);
  const [addingRoom, setAddingRoom] = useState(false);

  const [chainUsers, setChainUsers] = useState<ChainUser[]>([]);
  const [adminId, setAdminId] = useState("");
  const [approver1Id, setApprover1Id] = useState("");
  const [approver2Id, setApprover2Id] = useState("");

  const [officeStartHour, setOfficeStartHour] = useState("8");
  const [officeEndHour, setOfficeEndHour] = useState("17");
  const [holidays, setHolidays] = useState<string[]>([]);
  const [newHoliday, setNewHoliday] = useState("");

  const [configLoadError, setConfigLoadError] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  async function loadRooms() {
    setRoomsLoadError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, capacity")
      .order("name", { ascending: true });

    if (error) {
      setRoomsLoadError("ไม่สามารถโหลดรายการห้องได้");
      return;
    }

    setRooms((data ?? []) as Room[]);
  }

  async function loadChainAndConfig() {
    setConfigLoadError(null);
    const supabase = createClient();

    const [configRes, usersRes] = await Promise.all([
      supabase
        .from("system_config")
        .select(
          "admin_id, approver1_id, approver2_id, office_start_hour, office_end_hour, holidays"
        )
        .single(),
      supabase
        .from("users")
        .select("id, full_name")
        .in("role", ["approver", "admin"])
        .order("full_name", { ascending: true }),
    ]);

    if (configRes.error || usersRes.error) {
      setConfigLoadError("ไม่สามารถโหลดข้อมูลการตั้งค่าได้");
      return;
    }

    setChainUsers((usersRes.data ?? []) as ChainUser[]);
    setAdminId(configRes.data.admin_id ?? "");
    setApprover1Id(configRes.data.approver1_id ?? "");
    setApprover2Id(configRes.data.approver2_id ?? "");
    setOfficeStartHour(String(configRes.data.office_start_hour));
    setOfficeEndHour(String(configRes.data.office_end_hour));
    setHolidays((configRes.data.holidays ?? []) as string[]);
  }

  useEffect(() => {
    loadRooms();
    loadChainAndConfig();
  }, []);

  async function handleAddRoom() {
    const capacityNum = Number(roomCapacity);

    if (roomName.trim().length === 0) {
      setRoomFormError("กรุณากรอกชื่อห้อง");
      return;
    }

    if (!Number.isInteger(capacityNum) || capacityNum <= 0) {
      setRoomFormError("จำนวนที่นั่งต้องมากกว่า 0");
      return;
    }

    setAddingRoom(true);
    setRoomFormError(null);

    const supabase = createClient();
    const { error } = await supabase.from("rooms").insert({
      name: roomName.trim(),
      capacity: capacityNum,
    });

    if (error) {
      setRoomFormError("เพิ่มห้องไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setAddingRoom(false);
      return;
    }

    setRoomName("");
    setRoomCapacity("");
    setAddingRoom(false);
    await loadRooms();
  }

  function addHoliday() {
    if (newHoliday && !holidays.includes(newHoliday)) {
      setHolidays([...holidays, newHoliday].sort());
      setNewHoliday("");
    }
  }

  function removeHoliday(date: string) {
    setHolidays(holidays.filter((h) => h !== date));
  }

  async function handleFinish() {
    setFinishing(true);
    setFinishError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setFinishError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setFinishing(false);
      return;
    }

    try {
      const chainRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-approval-chain`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            admin_id: adminId,
            approver1_id: approver1Id,
            approver2_id: approver2Id,
            office_start_hour: Number(officeStartHour),
            office_end_hour: Number(officeEndHour),
            holidays,
          }),
        }
      );

      const chainResult = await chainRes.json();

      if (!chainRes.ok) {
        setFinishError(
          chainResult.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
        );
        return;
      }

      const completeRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/complete-setup`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const completeResult = await completeRes.json();

      if (!completeRes.ok) {
        setFinishError(
          completeResult.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"
        );
        return;
      }

      router.push("/dashboard");
    } catch {
      setFinishError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setFinishing(false);
    }
  }

  const totalRooms = rooms.length;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ตั้งค่าระบบเริ่มต้น
      </h1>
      <p className="mt-1 text-sm text-text-secondary">ขั้นตอน {step} / 4</p>

      {step === 1 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="text-text-primary">
            ยินดีต้อนรับสู่ระบบจองห้องประชุม LPRU ก่อนเริ่มใช้งาน
            กรุณาตั้งค่าเริ่มต้น 3 ขั้นตอน ได้แก่ เพิ่มห้องประชุม, กำหนด
            Approval Chain, และเวลาทำการ
          </p>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-4 rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary"
          >
            เริ่มต้น
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="font-medium text-text-primary">เพิ่มห้องประชุม</p>

          {roomsLoadError && (
            <p className="mt-2 text-sm text-danger-text">{roomsLoadError}</p>
          )}

          <div className="mt-3 space-y-2">
            {rooms.map((r) => (
              <div key={r.id} className="text-sm text-text-primary">
                {r.name} (จุ {r.capacity} คน)
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-sm text-text-secondary">ยังไม่มีห้อง</p>
            )}
          </div>

          <div className="mt-4 flex gap-3">
            <input
              type="text"
              placeholder="ชื่อห้อง"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-1/2 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <input
              type="number"
              min={1}
              placeholder="จำนวนที่นั่ง"
              value={roomCapacity}
              onChange={(e) => setRoomCapacity(e.target.value)}
              className="w-1/3 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <button
              type="button"
              onClick={handleAddRoom}
              disabled={addingRoom}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
            >
              {addingRoom ? "กำลังเพิ่ม..." : "เพิ่ม"}
            </button>
          </div>
          {roomFormError && (
            <p className="mt-2 text-sm text-danger-text">{roomFormError}</p>
          )}

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={totalRooms === 0}
              className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="font-medium text-text-primary">Approval Chain</p>

          {configLoadError && (
            <p className="mt-2 text-sm text-danger-text">{configLoadError}</p>
          )}

          <div className="mt-3 space-y-3">
            <div>
              <label className="text-sm text-text-secondary">
                Admin (ขั้นที่ 1)
              </label>
              <select
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              >
                <option value="">-- เลือก --</option>
                {chainUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-text-secondary">
                Approver 1 (ขั้นที่ 2)
              </label>
              <select
                value={approver1Id}
                onChange={(e) => setApprover1Id(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              >
                <option value="">-- เลือก --</option>
                {chainUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-text-secondary">
                Approver 2 (ขั้นที่ 3)
              </label>
              <select
                value={approver2Id}
                onChange={(e) => setApprover2Id(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              >
                <option value="">-- เลือก --</option>
                {chainUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="font-medium text-text-primary">เวลาทำการ</p>

          <div className="mt-3 flex gap-3">
            <div>
              <label className="text-sm text-text-secondary">
                เปิด (ชม.)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={officeStartHour}
                onChange={(e) => setOfficeStartHour(e.target.value)}
                className="mt-1 w-24 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary">
                ปิด (ชม.)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={officeEndHour}
                onChange={(e) => setOfficeEndHour(e.target.value)}
                className="mt-1 w-24 rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
          </div>

          <p className="mt-4 font-medium text-text-primary">วันหยุด</p>
          <div className="mt-2 flex gap-3">
            <input
              type="date"
              value={newHoliday}
              onChange={(e) => setNewHoliday(e.target.value)}
              className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
            />
            <button
              type="button"
              onClick={addHoliday}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              เพิ่ม
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {holidays.map((h) => (
              <div key={h} className="flex items-center justify-between">
                <span className="text-sm text-text-primary">{h}</span>
                <button
                  type="button"
                  onClick={() => removeHoliday(h)}
                  className="text-sm text-danger-text"
                >
                  ลบ
                </button>
              </div>
            ))}
            {holidays.length === 0 && (
              <p className="text-sm text-text-secondary">ยังไม่มีวันหยุด</p>
            )}
          </div>

          {finishError && (
            <p className="mt-4 text-sm text-danger-text">{finishError}</p>
          )}

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={handleFinish}
              disabled={finishing}
              className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
            >
              {finishing ? "กำลังบันทึก..." : "เสร็จสิ้น"}
            </button>
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
Expected: build สำเร็จ, route list มี `/setup` (ตรวจด้วย `ls "app/setup/"` ก่อนด้วยว่ามีแค่ไฟล์นี้ และ `ls "app/"` ยืนยันว่า `setup/` อยู่แยกจาก `(app)/` ไม่ได้ซ้อนอยู่ข้างใน)

- [ ] **Step 4: Commit**

```bash
git add "app/setup/page.tsx"
git commit -m "feat: add first-time setup wizard page"
```

---

### Task 4: Manual Verification

**Files:** ไม่มี (verification เท่านั้น)

**ส่วนที่ทดสอบได้ตอนนี้ (ไม่ต้องพึ่ง Supabase MCP/execute_sql):**

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่, route list มี `/setup`

- [ ] **Step 2: ทดสอบ `/setup` — login เป็น admin**

`npm run dev`, login ด้วย `admin@test.local`, เข้า `/setup` ตรงๆ ทาง URL
Expected: เห็นขั้นตอน 1 (intro) พร้อมข้อความต้อนรับและปุ่ม "เริ่มต้น" — ไม่มี nav bar ของ `(app)` layout ปรากฏ (หน้านี้อยู่นอกกลุ่ม layout)

- [ ] **Step 3: ทดสอบขั้นตอน 2 (เพิ่มห้อง)**

กด "เริ่มต้น" ไปขั้นตอน 2
Expected: เห็นรายชื่อห้องที่มีอยู่แล้วจาก seed data, ปุ่ม "ถัดไป" enabled ทันที (เพราะมีห้องอยู่แล้ว ≥1)
เพิ่มห้องใหม่ผ่านฟอร์ม quick-add
Expected: ห้องใหม่ปรากฏในรายการทันทีหลังเพิ่มสำเร็จ

- [ ] **Step 4: ทดสอบขั้นตอน 3 (Approval Chain)**

กด "ถัดไป" ไปขั้นตอน 3
Expected: dropdown ทั้ง 3 ช่อง prefill ด้วยค่าเดิมจาก seed data (`admin@test.local`, `approver1@test.local`, `approver2@test.local`)

- [ ] **Step 5: ทดสอบขั้นตอน 4 (Business Hours) และปุ่มย้อนกลับ**

กด "ถัดไป" ไปขั้นตอน 4
Expected: office_start_hour/office_end_hour prefill ตรงกับ seed data (8, 17)
กด "ย้อนกลับ" กลับไปขั้นตอน 3
Expected: ค่า dropdown ที่เลือกไว้ก่อนหน้ายังอยู่ (state ไม่หาย)

- [ ] **Step 6: ทดสอบ middleware gate สำหรับ `/setup`**

Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/setup` ตรงๆ ทาง URL
Expected: ถูก middleware redirect ไป `/home` ทันที (prefix `/setup` มีอยู่แล้วใน `ROUTE_ROLES` จาก sub-project ก่อนหน้า — role ไม่ตรงจึง redirect)

**ส่วนที่ต้อง flip `system_config.setup_completed` ก่อนถึงจะทดสอบได้จริง (deferred ให้ผู้ใช้):**

- [ ] **Step 7: Deploy Edge Function + ทดสอบ auto-redirect จริง**

เซสชันนี้ไม่มี Supabase MCP/execute_sql — **ต้องให้ผู้ใช้ทำขั้นตอนนี้เอง**:
- Deploy `complete-setup` Edge Function (`verify_jwt=true`)
- แก้ `system_config.setup_completed = false` ผ่าน SQL Editor หรือ MCP
- Login เป็น admin เข้า `/dashboard` ใดๆ → ควรถูก redirect ไป `/setup` อัตโนมัติ
- ทำ wizard ให้ครบทั้ง 4 ขั้นตอนแล้วกด "เสร็จสิ้น" → ตรวจว่า redirect ไป `/dashboard` สำเร็จ และ `system_config.setup_completed` กลายเป็น `true` ในฐานข้อมูลจริง

---

## Self-Review Notes

- **Spec coverage:** `complete-setup` Edge Function → Task 1, middleware auto-redirect → Task 2, หน้า `/setup` ทั้ง 4 ขั้นตอน → Task 3, success criteria ทั้ง 9 ข้อในสเปค → Task 4 ครบ (แบ่งทดสอบได้ตอนนี้ 6 ข้อ, รอ flip DB state 1 ข้อ (Step 7) — ตรงกับสเปคข้อ 9 ที่แยกไว้ชัดเจนว่าต้องรอ)
- **Placeholder scan:** ไม่มี TBD/TODO ที่ไม่มีเนื้อหา
- **Type consistency:** `Room`/`ChainUser` types ใช้ตรงกันทั้งใน state และ query select — response shape ของ `update-approval-chain`/`complete-setup` ไม่ได้ถูกอ่านค่าเจาะจงในหน้า (แค่เช็ค `res.ok` แล้วไปขั้นตอนต่อ) จึงไม่มีความเสี่ยง type mismatch
- **Route placement:** ยืนยันแล้วว่า `/setup` ต้องอยู่ที่ `app/setup/page.tsx` (นอกกลุ่ม `(app)`) เพราะ PRODUCT.md ระบุว่าเป็นหน้าเต็มจอไม่มี nav — ตรวจสอบซ้ำใน Task 3's คำเตือนและ Task 4 Step 2
- **Middleware risk:** Task 2 มีคำเตือนชัดเจนว่าเป็นไฟล์ shared ทั่วทั้งแอป ให้แก้เฉพาะบล็อกที่ระบุ พร้อม fail-open behavior ป้องกันไม่ให้ query ล้มเหลวทำให้ทั้งแอปพัง
- **บทเรียนจาก sub-project 1's final review (I-1) ถูกนำมาใช้ล่วงหน้า:** `handleFinish()` ห่อ fetch ทั้งสองครั้งด้วย try/catch/finally ตั้งแต่ต้น
- **ไม่แก้ `update-approval-chain`:** ยืนยันว่า Task 3's `handleFinish()` เรียก endpoint เดิมด้วย body shape เดิมทุกประการ ไม่มีการแก้ไข Edge Function นั้นเลยในแผนนี้
