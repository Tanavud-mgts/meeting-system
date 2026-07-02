# Track A — Room Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง flow การจองห้องจริง — หน้า `/booking` แบบ 2 ขั้นตอน (ค้นหา → กรอกรายละเอียด) พร้อม Edge Functions 2 ตัวที่รองรับ

**Architecture:** ขั้นค้นหาห้อง (step 1) query ตรงจาก Supabase browser client (RLS อนุญาตอยู่แล้ว ไม่ต้องผ่าน Edge Function) ส่วน config (business hours) และการสร้าง booking จริงต้องผ่าน Edge Function เพราะต้องการ service_role (bypass RLS ของ `system_config`) หรือต้องการ validation ที่ทำซ้ำได้ยากฝั่ง client เพียงอย่างเดียว

**Tech Stack:** Next.js 16 (App Router, client component), Supabase Edge Functions (Deno), Supabase JS client, Tailwind v4 (design tokens จาก Foundation phase)

## Global Constraints

- Edge Function ทุกตัวต้องห่อด้วย `withErrorHandling()` จาก `../_shared/handler.ts` และ throw `AppError` subclass จาก `../_shared/errors.ts` เท่านั้น ไม่เขียน try-catch เองแยก (CLAUDE.md กฎข้อ 1)
- **ห้าม insert เข้า `booking_slots` เองในโค้ด** — trigger `trg_create_slot` สร้างให้อัตโนมัติแล้ว (bug นี้เจอและแก้ไปแล้วครั้งหนึ่งในรอบก่อน)
- `requester_id` ของ booking ต้องมาจาก JWT ของผู้เรียก (ผ่าน `auth.getUser()`) ไม่รับจาก request body โดยตรง (กัน user ปลอมตัวเป็นคนอื่น)
- ข้อความ UI และ error ทั้งหมดเป็นภาษาไทยทางการ
- ห้าม hardcode สี/spacing/font — ใช้ Tailwind class จาก token ที่ผูกไว้แล้ว (`bg-brand-primary`, `bg-surface-card`, `rounded-lg`, ฯลฯ)
- **ไม่มี Deno CLI หรือ Supabase CLI ในสภาพแวดล้อมนี้ และ Supabase MCP ไม่ได้เชื่อมต่อ** — Edge Function 2 ตัวในแผนนี้ (`get-booking-config`, `create-booking`) เขียนโค้ด Deno จริง (`Deno.serve`, `npm:` specifier, `Deno.env.get`) ซึ่ง **type-check ด้วย `tsc` ของโปรเจกต์ไม่ได้และรันทดสอบจริงในเซสชันนี้ไม่ได้เลย** — verification ของทั้งสองไฟล์นี้จำกัดอยู่แค่ manual code review เท่านั้น การทดสอบจริงต้องรอจนกว่าจะ deploy ได้ (ผ่าน MCP reconnect หรือ Supabase Dashboard/CLI ที่ผู้ใช้ทำเอง — ดู Task 5)

---

## File Structure

| ไฟล์ | สถานะ | หน้าที่ |
|---|---|---|
| `tsconfig.json` | แก้ไข | exclude `supabase/functions` ออกจาก root type-check |
| `supabase/functions/get-booking-config/index.ts` | สร้างใหม่ | คืน office hours + holidays |
| `supabase/functions/create-booking/index.ts` | สร้างใหม่ | สร้าง booking ใหม่ |
| `app/(app)/booking/page.tsx` | สร้างใหม่ | หน้า 2-step จองห้อง |

---

### Task 1: แก้ tsconfig.json ให้ exclude Edge Functions

**เหตุผล:** `get-booking-config/index.ts` และ `create-booking/index.ts` (Task 2-3) จะใช้ syntax เฉพาะของ Deno (`Deno.serve`, `npm:` import specifier, `Deno.env.get`) ซึ่งไม่ใช่ syntax ที่ถูกต้องภายใต้ tsconfig ปัจจุบันของโปรเจกต์ (Node/Next.js) เนื่องจาก `include` เดิมเป็น glob กว้าง (`**/*.ts`) ที่จะดึงไฟล์เหล่านี้เข้ามา type-check ด้วย ทำให้ `npx tsc --noEmit` ที่ root จะ error ทันทีที่ไฟล์เหล่านี้ถูกสร้าง ถ้าไม่ exclude ออกก่อน ปัญหานี้จะเกิดกับทุก track ที่สร้าง Edge Function จริง (ไม่ใช่แค่ track นี้)

**Files:**
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: ไม่มี
- Produces: root `npx tsc --noEmit` จะไม่ตรวจไฟล์ใต้ `supabase/functions/` อีกต่อไป (ทั้งไฟล์ที่มีอยู่แล้วอย่าง `_shared/*.ts` และไฟล์ Deno entrypoint ใหม่)

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
(field อื่นในไฟล์ไม่ต้องแก้)

- [ ] **Step 3: ยืนยันว่า root tsc ยังผ่านเหมือนเดิม**

Run: `npx tsc --noEmit`
Expected: no errors (เหมือนก่อนแก้ เพราะยังไม่มีไฟล์ Deno entrypoint ใหม่ตอนนี้)

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json
git commit -m "chore: exclude supabase/functions from root tsc (Deno syntax incompatible with Node tsconfig)"
```

---

### Task 2: Edge Function `get-booking-config`

**Files:**
- Create: `supabase/functions/get-booking-config/index.ts`

**Interfaces:**
- Consumes: `withErrorHandling` จาก `../_shared/handler.ts`, `NotFoundError` จาก `../_shared/errors.ts` (มีอยู่แล้วจาก Foundation phase)
- Produces: HTTP endpoint `GET /functions/v1/get-booking-config` คืน JSON `{ office_start_hour: number, office_end_hour: number, holidays: string[] }` เมื่อสำเร็จ (status 200)

**หมายเหตุ:** ไฟล์นี้ type-check ด้วย `tsc` ไม่ได้ (ดู Global Constraints) — verify ด้วยการอ่านทวนโค้ดอย่างละเอียดแทน

- [ ] **Step 1: สร้างไฟล์**

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { NotFoundError } from "../_shared/errors.ts";

Deno.serve(
  withErrorHandling(async (_req: Request) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("system_config")
      .select("office_start_hour, office_end_hour, holidays")
      .single();

    if (error || !data) {
      throw new NotFoundError("ไม่พบข้อมูลการตั้งค่าระบบ");
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: อ่านทวนโค้ดด้วยตนเอง (manual review แทน type-check)**

ตรวจด้วยตาว่า:
- import path `../_shared/handler.ts` และ `../_shared/errors.ts` ถูกต้องตรงกับตำแหน่งไฟล์จริง (ทั้งสามไฟล์อยู่ใต้ `supabase/functions/_shared/`)
- `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` เป็นชื่อ env var มาตรฐานที่ Supabase inject ให้ทุก Edge Function อัตโนมัติ (ไม่ต้อง set เอง)
- ไม่มี logic การ insert หรือแก้ไขข้อมูลใดๆ ในไฟล์นี้ (อ่านอย่างเดียว)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/get-booking-config/index.ts
git commit -m "feat: add get-booking-config edge function"
```

---

### Task 3: Edge Function `create-booking`

**Files:**
- Create: `supabase/functions/create-booking/index.ts`

**Interfaces:**
- Consumes: `withErrorHandling`, `ValidationError`, `UnauthorizedError`, `ConflictError` จาก `_shared/`
- Produces: HTTP endpoint `POST /functions/v1/create-booking` รับ body `{ room_id: string, title: string, activity: string, attendees: number, start_time: string, end_time: string }` คืน `{ id: string, ref_id: string }` (status 201) เมื่อสำเร็จ

**หมายเหตุ:** เช่นเดียวกับ Task 2 — type-check ด้วย `tsc` ไม่ได้ ใช้ manual review

- [ ] **Step 1: สร้างไฟล์**

```typescript
import { createClient } from "npm:@supabase/supabase-js@2";
import { withErrorHandling } from "../_shared/handler.ts";
import { ValidationError, UnauthorizedError, ConflictError } from "../_shared/errors.ts";

interface CreateBookingRequest {
  room_id: string;
  title: string;
  activity: string;
  attendees: number;
  start_time: string;
  end_time: string;
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

    const body: CreateBookingRequest = await req.json();

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: room, error: roomError } = await adminClient
      .from("rooms")
      .select("capacity")
      .eq("id", body.room_id)
      .single();

    if (roomError || !room) {
      throw new ValidationError("ไม่พบห้องประชุมที่เลือก");
    }

    if (body.attendees > room.capacity) {
      throw new ValidationError("จำนวนผู้เข้าร่วมเกินความจุห้อง");
    }

    const { data: booking, error: insertError } = await adminClient
      .from("bookings")
      .insert({
        room_id: body.room_id,
        requester_id: user.id,
        title: body.title,
        activity: body.activity,
        attendees: body.attendees,
        start_time: body.start_time,
        end_time: body.end_time,
      })
      .select("id, ref_id")
      .single();

    if (insertError) {
      if (insertError.code === "23P01") {
        throw new ConflictError("ห้องถูกจองแล้วในช่วงเวลานี้ กรุณาเลือกเวลาอื่น");
      }
      if (insertError.code === "P0001") {
        throw new ValidationError(insertError.message);
      }
      throw insertError;
    }

    return new Response(JSON.stringify(booking), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  })
);
```

- [ ] **Step 2: อ่านทวนโค้ดด้วยตนเอง**

ตรวจด้วยตาว่า:
- **ไม่มีการ insert เข้า `booking_slots` ที่ไหนในไฟล์นี้เลย** (จุดที่พลาดได้ง่ายที่สุด — ดู Global Constraints)
- `requester_id: user.id` มาจาก `authClient.auth.getUser()` เท่านั้น ไม่ใช่จาก `body`
- `authClient` (สร้างด้วย anon key + forward header) ใช้แค่หา identity ของผู้เรียก, `adminClient` (service_role) ใช้ทำ query/insert จริงเท่านั้น — ไม่ใช้ `authClient` insert ข้อมูล (จะโดน RLS INSERT policy บล็อกไม่ได้เพราะ policy อนุญาต insert ตัวเองอยู่แล้ว แต่เพื่อความสม่ำเสมอกับ pattern อื่นและรองรับ trigger/validation ที่อาจต้องการ service_role ในอนาคต ให้ใช้ adminClient)
- ลำดับการเช็ค error code (`23P01` ก่อน `P0001`) ไม่ทับซ้อนกัน แต่ละ error code map ไป AppError ที่ถูกต้องตามตาราง Error Handling ใน spec
- `SUPABASE_ANON_KEY` เป็นชื่อ env var มาตรฐานที่ Supabase inject ให้อัตโนมัติเช่นเดียวกับ `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-booking/index.ts
git commit -m "feat: add create-booking edge function"
```

---

### Task 4: หน้า `/booking` — ขั้นที่ 1 (ค้นหาห้องว่าง)

**Files:**
- Create: `app/(app)/booking/page.tsx`

**Interfaces:**
- Consumes: `createClient()` จาก `@/lib/supabase/client` (Foundation phase, sync browser client)
- Produces: component state `step`, `config`, `date`, `startTime`, `endTime`, `rooms`, `unavailableRoomIds` ที่ Task 5 จะต่อยอด (ขั้นที่ 2 อยู่ในไฟล์เดียวกัน)

- [ ] **Step 1: สร้างไฟล์พร้อมโครง step 1 ทั้งหมด**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type BookingConfig = {
  office_start_hour: number;
  office_end_hour: number;
  holidays: string[];
};

type Room = {
  id: string;
  name: string;
  capacity: number;
  equipment: string[];
};

export default function BookingPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [config, setConfig] = useState<BookingConfig | null>(null);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [rooms, setRooms] = useState<Room[]>([]);
  const [unavailableRoomIds, setUnavailableRoomIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-booking-config`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );

      if (res.ok) {
        setConfig(await res.json());
      }
    }
    loadConfig();
  }, []);

  const minTime = config
    ? `${String(config.office_start_hour).padStart(2, "0")}:00`
    : undefined;
  const maxTime = config
    ? `${String(config.office_end_hour).padStart(2, "0")}:00`
    : undefined;
  const isHoliday = config ? config.holidays.includes(date) : false;

  async function handleSearch() {
    setSearching(true);
    setSearchError(null);
    setHasSearched(false);

    const supabase = createClient();
    const startISO = `${date}T${startTime}:00+07:00`;
    const endISO = `${date}T${endTime}:00+07:00`;

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select("id, name, capacity, equipment")
      .neq("status", "maintenance")
      .order("capacity", { ascending: true });

    if (roomsError) {
      setSearchError("ไม่สามารถโหลดรายชื่อห้องได้ กรุณาลองใหม่อีกครั้ง");
      setSearching(false);
      return;
    }

    const { data: slots, error: slotsError } = await supabase
      .from("booking_slots")
      .select("room_id")
      .lt("start_time", endISO)
      .gt("end_time", startISO);

    if (slotsError) {
      setSearchError("ไม่สามารถตรวจสอบห้องว่างได้ กรุณาลองใหม่อีกครั้ง");
      setSearching(false);
      return;
    }

    setRooms(roomsData ?? []);
    setUnavailableRoomIds(
      new Set((slots ?? []).map((s: { room_id: string }) => s.room_id))
    );
    setHasSearched(true);
    setSearching(false);
  }

  function handleSelectRoom(room: Room) {
    setSelectedRoom(room);
    setStep(2);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">จองห้องประชุม</h1>

      {step === 1 && (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-surface-card p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                วันที่
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                เวลาเริ่ม
                <input
                  type="time"
                  value={startTime}
                  min={minTime}
                  max={maxTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-text-secondary">
                เวลาจบ
                <input
                  type="time"
                  value={endTime}
                  min={minTime}
                  max={maxTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-sm border border-neutral-300 px-3 py-2"
                />
              </label>
            </div>

            {isHoliday && (
              <p className="mt-3 text-sm text-danger-text">
                วันที่เลือกเป็นวันหยุด ไม่สามารถจองห้องได้
              </p>
            )}

            <button
              type="button"
              onClick={handleSearch}
              disabled={!date || !startTime || !endTime || isHoliday || searching}
              className="mt-4 rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
            >
              {searching ? "กำลังค้นหา..." : "ค้นหาห้องว่าง"}
            </button>

            {searchError && (
              <p className="mt-3 text-sm text-danger-text">{searchError}</p>
            )}
          </div>

          {hasSearched && (
            <div className="space-y-2">
              {rooms.map((room) => {
                const unavailable = unavailableRoomIds.has(room.id);
                return (
                  <button
                    key={room.id}
                    type="button"
                    disabled={unavailable}
                    onClick={() => handleSelectRoom(room)}
                    className={`w-full rounded-lg border border-neutral-200 bg-surface-card p-4 text-left ${
                      unavailable ? "opacity-40" : "hover:bg-neutral-50"
                    }`}
                  >
                    <p className="font-medium text-text-primary">{room.name}</p>
                    <p className="text-sm text-text-secondary">
                      ความจุ {room.capacity} คน
                      {unavailable && " — ไม่ว่างในช่วงเวลานี้"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
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
Expected: build สำเร็จ, `/booking` ปรากฏใน route list

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/booking/page.tsx"
git commit -m "feat: add booking page step 1 (room search)"
```

---

### Task 5: หน้า `/booking` — ขั้นที่ 2 (กรอกรายละเอียด + ส่ง)

**Files:**
- Modify: `app/(app)/booking/page.tsx`

**Interfaces:**
- Consumes: state จาก Task 4 (`selectedRoom`, `date`, `startTime`, `endTime`, `step`, `setStep`)
- Produces: เรียก `POST /functions/v1/create-booking`

- [ ] **Step 1: เพิ่ม state และฟังก์ชัน submit เข้าไปในไฟล์เดิม**

เพิ่มบรรทัดต่อไปนี้ต่อจาก state ที่มีอยู่แล้วใน `app/(app)/booking/page.tsx` (หลัง `const [hasSearched, ...]`):

```tsx
  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState("");
  const [attendees, setAttendees] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refId, setRefId] = useState<string | null>(null);
```

เพิ่มฟังก์ชันนี้ต่อจาก `handleSelectRoom`:

```tsx
  const attendeesExceedsCapacity =
    selectedRoom !== null &&
    attendees !== "" &&
    Number(attendees) > selectedRoom.capacity;

  async function handleSubmit() {
    if (!selectedRoom) return;
    if (attendeesExceedsCapacity) return;

    setSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setSubmitError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSubmitting(false);
      return;
    }

    const startISO = `${date}T${startTime}:00+07:00`;
    const endISO = `${date}T${endTime}:00+07:00`;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-booking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room_id: selectedRoom.id,
          title,
          activity,
          attendees: Number(attendees),
          start_time: startISO,
          end_time: endISO,
        }),
      }
    );

    const result = await res.json();

    if (!res.ok) {
      setSubmitError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      setSubmitting(false);
      return;
    }

    setRefId(result.ref_id);
    setSubmitting(false);
  }

  function handleBackToSearch() {
    setStep(1);
    setSelectedRoom(null);
    setSubmitError(null);
  }
```

เพิ่ม JSX นี้ต่อจาก `{step === 1 && ( ... )}` block เดิม (ก่อน `</div>` ปิดท้ายของ `return`):

```tsx
      {step === 2 && selectedRoom && !refId && (
        <div className="mt-6 space-y-4 rounded-lg border border-neutral-200 bg-surface-card p-5">
          <p className="text-sm text-text-secondary">
            ห้อง: {selectedRoom.name} (ความจุ {selectedRoom.capacity} คน)
          </p>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            ชื่อการประชุม
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-sm border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            รายละเอียดกิจกรรม
            <textarea
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="rounded-sm border border-neutral-300 px-3 py-2"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            จำนวนผู้เข้าร่วม
            <input
              type="number"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              className="rounded-sm border border-neutral-300 px-3 py-2"
            />
          </label>

          {attendeesExceedsCapacity && (
            <p className="text-sm text-danger-text">
              จำนวนผู้เข้าร่วมเกินความจุห้อง
            </p>
          )}

          {submitError && (
            <p className="text-sm text-danger-text">{submitError}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBackToSearch}
              className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
            >
              กลับไปเลือกห้องใหม่
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                !title || !activity || !attendees || attendeesExceedsCapacity || submitting
              }
              className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันการจอง"}
            </button>
          </div>
        </div>
      )}

      {refId && (
        <div className="mt-6 rounded-lg border border-success-accent bg-success-surface p-5">
          <p className="font-medium text-success-text">จองห้องสำเร็จ</p>
          <p className="mt-1 text-sm text-success-text">
            หมายเลขอ้างอิง: {refId}
          </p>
        </div>
      )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build สำเร็จ

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/booking/page.tsx"
git commit -m "feat: add booking page step 2 (details form and submission)"
```

---

### Task 6: Manual Verification (แบ่งเป็นส่วนที่ทดสอบได้ตอนนี้ กับส่วนที่รอ deploy)

**Files:** ไม่มี (verification เท่านั้น)

**ส่วนที่ทดสอบได้ตอนนี้ (ไม่ต้องพึ่ง Edge Function):**

- [ ] **Step 1: Build รวม**

Run: `npx tsc --noEmit && npm run build`
Expected: ผ่านทั้งคู่

- [ ] **Step 2: ทดสอบขั้นที่ 1 ด้วย browser จริง (rooms/booking_slots query ตรงจาก client ใช้งานได้กับ Supabase Cloud จริง — ไม่ต้องพึ่ง Edge Function)**

`npm run dev`, login ด้วย `user@test.local` (มี seed data booking ตัวอย่างอยู่แล้วจากรอบก่อน), เข้า `/booking`, เลือกวันที่ 2025-07-10 เวลา 09:00-11:00 (ตรงกับ Booking 1 ใน seed data ที่ห้อง `ห้องประชุม 1`), กด "ค้นหาห้องว่าง"
Expected: `ห้องประชุม 1` แสดงเป็น disabled จาง พร้อมข้อความ "ไม่ว่างในช่วงเวลานี้" ห้องอื่นเลือกได้ปกติ

- [ ] **Step 3: ทดสอบ attendees เกิน capacity (client-side ล้วน ไม่ต้องพึ่ง Edge Function)**

ทำ Step 2 ต่อจนเลือกห้องได้ (เข้า step 2 ของฟอร์ม) — เลือกห้องความจุน้อย (เช่น `ห้องประชุม 3` capacity 15) กรอก attendees เป็น 20
Expected: เห็น error "จำนวนผู้เข้าร่วมเกินความจุห้อง" ทันทีที่ client โดยไม่ต้องกดส่ง (ปุ่ม "ยืนยันการจอง" ถูก disable) — ทดสอบได้ตอนนี้เพราะ `attendeesExceedsCapacity` คำนวณฝั่ง client ล้วนๆ ไม่มีการเรียก network

**ส่วนที่ต้อง deploy Edge Function ก่อนถึงจะทดสอบได้จริง:**

- [ ] **Step 4: ทดสอบ business hours constraint จาก UI (รอ Step 5 deploy ก่อน)**

ตรวจว่า time picker ของ "เวลาเริ่ม"/"เวลาจบ" มี `min`/`max` ตรงกับค่าที่ `get-booking-config` ควรจะคืน (ตรวจค่าจริงใน `system_config` ผ่าน SQL Editor เทียบกับที่ UI แสดง) — **หมายเหตุ:** ถ้า `get-booking-config` ยังไม่ได้ deploy การเรียก fetch จะล้มเหลวเงียบๆ (ตาม logic ที่เขียนไว้ใน Task 4 — ไม่ set error, แค่ config เป็น null และ time picker ไม่มี min/max) ให้ทำ Step 5 (deploy) ก่อนแล้วค่อยกลับมาทำขั้นนี้

- [ ] **Step 5: Deploy 2 Edge Functions**

เซสชันนี้ไม่มี Deno CLI, ไม่มี Supabase CLI, และ Supabase MCP ไม่ได้เชื่อมต่อ — **ต้องให้ผู้ใช้ทำขั้นตอนนี้เอง** ด้วยวิธีใดวิธีหนึ่ง:
- Reconnect Supabase MCP แล้วใช้ `deploy_edge_function` tool กับทั้งสองไฟล์ (`verify_jwt=true` ทั้งคู่)
- หรือติดตั้ง Supabase CLI เองแล้วรัน `supabase functions deploy get-booking-config` และ `supabase functions deploy create-booking`

- [ ] **Step 6: ทดสอบขั้นที่ 2 แบบเต็ม end-to-end (หลัง deploy สำเร็จ)**

Login ด้วย `user@test.local`, จองห้องที่ว่างในช่วงเวลาที่ยังไม่มีใครจอง, กรอก title/activity/attendees, กดยืนยัน
Expected: เห็นข้อความ "จองห้องสำเร็จ" พร้อม `ref_id` รูปแบบ `BK-YYYYMMDD-XXX`

ตรวจใน SQL Editor: `SELECT COUNT(*) FROM booking_slots WHERE booking_id = '<id ที่ได้>';` ต้องได้ `1` แถวเท่านั้น (ไม่ใช่ 2 จากการ insert ซ้ำ)

- [ ] **Step 7: ทดสอบ conflict (จองซ้อนเวลา)**

จองห้อง+เวลาเดียวกับที่เพิ่งจองสำเร็จใน Step 6 อีกครั้ง (จากบัญชีเดียวกันหรือคนละบัญชีก็ได้)
Expected: เห็นข้อความ "ห้องถูกจองแล้วในช่วงเวลานี้ กรุณาเลือกเวลาอื่น" ไม่ใช่ error ทั่วไป

---

## Self-Review Notes

- **Spec coverage:** `get-booking-config` → Task 2, `create-booking` → Task 3, ขั้นที่ 1 ค้นหา → Task 4, ขั้นที่ 2 ฟอร์ม+submit → Task 5. Success criteria ทั้ง 7 ข้อในสเปคครอบคลุมใน Task 6 (แบ่งชัดเจนว่าข้อไหนทดสอบได้ตอนนี้ — #3 ค้นหาห้องไม่ว่าง, #4 attendees validation — กับข้อไหนต้องรอ deploy — #2 business hours, #5 booking สำเร็จ, #6 conflict, #7 นอกเวลาทำการ)
- **Placeholder scan:** ไม่มี TBD/TODO ทุก step มีโค้ดเต็มหรือคำสั่งที่รันได้จริง
- **Type consistency:** `Room` type จาก Task 4 ใช้ซ้ำใน Task 5 ตรงกัน (`selectedRoom: Room | null`, เข้าถึง `.capacity`/`.id`/`.name`) ไม่มีการเปลี่ยนชื่อ field
- **Deno verification gap:** บันทึกไว้ชัดเจนใน Global Constraints และ Task 2-3 ว่า Edge Function 2 ไฟล์ verify ด้วย tooling อัตโนมัติไม่ได้เลยในเซสชันนี้ ต้องพึ่ง manual review เท่านั้น และ Task 6 แยกส่วนทดสอบได้ตอนนี้ vs ต้องรอ deploy ไว้ชัดเจน ไม่ปนกัน
