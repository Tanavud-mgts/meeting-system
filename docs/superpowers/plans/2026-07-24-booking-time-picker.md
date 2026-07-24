# Booking Time Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ป้องกันการเลือก/จองเวลานอกเวลาทำการ โดยเปลี่ยนช่องเวลาในหน้าจองเป็น dropdown ช่วง 30 นาทีที่ generate จาก config และแก้ trigger ฐานข้อมูลให้เทียบเวลาเต็มรวมนาที

**Architecture:** แยก logic การสร้างรายการเวลาออกเป็น pure functions ใน `lib/booking/timeSlots.ts` (ทดสอบด้วย Vitest) แล้วให้หน้า `booking/page.tsx` เรียกใช้ผ่าน `<select>` สองช่องที่เชื่อมกัน ส่วนฐานข้อมูลแก้ `validate_booking_hours()` ผ่าน migration `CREATE OR REPLACE` (ไม่ DROP) ให้เป็นด่านสุดท้ายที่ถูกต้องทุกทางเข้า

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Vitest, Supabase PostgreSQL (plpgsql trigger)

## Global Constraints

- Business Hours ต้องอ่านจาก `system_config` (`office_start_hour`, `office_end_hour`) เสมอ — ห้าม hardcode 8–17 (Critical Rule #4)
- ห้าม `DROP` migration ใน production — ใช้ `CREATE OR REPLACE` (Critical Rule #8)
- migration รันผ่าน `apply_migration` MCP tool เท่านั้น ตรวจด้วย `list_migrations` ก่อน
- ข้อความ UI/error ทุกจุดเป็นภาษาไทยทางการ (Critical Rule #9)
- UI ใช้ design token เดิม ห้าม hardcode สี/spacing (Critical Rule #10) — ในงานนี้ `<select>` ใช้ className เดิมของ `<input>` เดิม
- state `startTime` / `endTime` คงเป็น string `"HH:MM"` — ห้ามเปลี่ยน contract ของ `handleSearch()` / `handleSubmit()`
- Test runner: `npm test` (= `vitest run`), include globs ครอบ `lib/**/*.test.ts` แล้ว

---

### Task 1: Pure helpers สร้างรายการเวลา (`lib/booking/timeSlots.ts`)

**Files:**
- Create: `lib/booking/timeSlots.ts`
- Test: `lib/booking/timeSlots.test.ts`

**Interfaces:**
- Consumes: ไม่มี (pure functions)
- Produces:
  - `buildTimeSlots(startHour: number, endHour: number): string[]` — คืนรายการ `"HH:MM"` ทีละ 30 นาที ตั้งแต่ `startHour:00` ถึง `endHour:00` (รวมปลายทั้งสอง)
  - `startOptions(slots: string[]): string[]` — คืน `slots` ยกเว้นค่าสุดท้าย
  - `endOptions(slots: string[], start: string): string[]` — คืนเฉพาะค่าใน `slots` ที่ > `start` (ถ้า `start` ว่างคืน `[]`)

- [ ] **Step 1: เขียน failing tests**

`lib/booking/timeSlots.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildTimeSlots, startOptions, endOptions } from "./timeSlots";

describe("buildTimeSlots", () => {
  it("office 8–17 คืน 19 ค่า เริ่ม 08:00 จบ 17:00", () => {
    const slots = buildTimeSlots(8, 17);
    expect(slots).toHaveLength(19);
    expect(slots[0]).toBe("08:00");
    expect(slots[1]).toBe("08:30");
    expect(slots[slots.length - 1]).toBe("17:00");
  });

  it("pad ชั่วโมงเลขหลักเดียวเป็นสองหลัก (9 → 09:00)", () => {
    expect(buildTimeSlots(9, 10)).toEqual(["09:00", "09:30", "10:00"]);
  });
});

describe("startOptions", () => {
  it("ตัดค่าสุดท้ายออก (เริ่มที่เวลาปิดไม่ได้)", () => {
    const slots = buildTimeSlots(8, 17);
    const opts = startOptions(slots);
    expect(opts).toHaveLength(18);
    expect(opts[opts.length - 1]).toBe("16:30");
    expect(opts).not.toContain("17:00");
  });
});

describe("endOptions", () => {
  it("คืนเฉพาะเวลาที่มากกว่าเวลาเริ่ม", () => {
    const slots = buildTimeSlots(8, 17);
    expect(endOptions(slots, "16:30")).toEqual(["17:00"]);
    expect(endOptions(slots, "08:00")[0]).toBe("08:30");
  });

  it("เวลาเริ่มว่างคืน array ว่าง", () => {
    expect(endOptions(buildTimeSlots(8, 17), "")).toEqual([]);
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npm test -- lib/booking/timeSlots.test.ts`
Expected: FAIL — module `./timeSlots` ไม่มี / export ไม่พบ

- [ ] **Step 3: เขียน implementation**

`lib/booking/timeSlots.ts`:

```typescript
// สร้างรายการเวลาแบบช่วงละ 30 นาที ตั้งแต่ startHour:00 ถึง endHour:00 (รวมปลายทั้งสอง)
// อ่านค่าชั่วโมงมาจาก system_config เท่านั้น — ห้าม hardcode 8–17
export function buildTimeSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let m = startHour * 60; m <= endHour * 60; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

// ตัวเลือกเวลาเริ่ม: ทุกช่วงยกเว้นค่าสุดท้าย (เริ่มที่เวลาปิดไม่ได้ เพราะไม่มีช่วงประชุม)
export function startOptions(slots: string[]): string[] {
  return slots.slice(0, -1);
}

// ตัวเลือกเวลาจบ: เฉพาะช่วงที่มากกว่าเวลาเริ่มที่เลือก; ถ้ายังไม่เลือกเริ่มคืนว่าง
export function endOptions(slots: string[], start: string): string[] {
  if (!start) return [];
  return slots.filter((s) => s > start);
}
```

หมายเหตุ: เปรียบเทียบ string `"HH:MM"` ด้วย `>` ใช้ได้ถูกต้องเพราะ zero-padded และความยาวเท่ากัน

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npm test -- lib/booking/timeSlots.test.ts`
Expected: PASS ทุดเคส

- [ ] **Step 5: Commit**

```bash
git add lib/booking/timeSlots.ts lib/booking/timeSlots.test.ts
git commit -m "feat(booking): pure helpers for 30-min time slot options"
```

---

### Task 2: เปลี่ยนช่องเวลาในหน้าจองเป็น dropdown

**Files:**
- Modify: `app/(app)/booking/page.tsx`

**Interfaces:**
- Consumes: `buildTimeSlots`, `startOptions`, `endOptions` จาก Task 1
- Produces: ไม่มี export ใหม่ (แก้ component ภายใน)

- [ ] **Step 1: import helpers และคำนวณ derived lists**

เพิ่ม import ใต้ import เดิม (บรรทัด ~10):

```typescript
import { buildTimeSlots, startOptions, endOptions } from "@/lib/booking/timeSlots";
```

แทนบล็อก `minTime` / `maxTime` (บรรทัด 143–148) ด้วย:

```typescript
  const timeSlots = config
    ? buildTimeSlots(config.office_start_hour, config.office_end_hour)
    : [];
  const startOpts = startOptions(timeSlots);
  const endOpts = endOptions(timeSlots, startTime);
  const isHoliday = config ? config.holidays.includes(date) : false;
```

(บรรทัด `isHoliday` เดิมคงเนื้อหาเดิม — ย้ายมารวมในบล็อกนี้ ลบบรรทัดซ้ำ)

- [ ] **Step 2: เพิ่ม handler รีเซ็ตเวลาจบเมื่อเปลี่ยนเวลาเริ่ม**

เพิ่มฟังก์ชันภายใน component (ใกล้ `handleSelectRoom`, ก่อน `return`):

```typescript
  function handleStartChange(value: string) {
    setStartTime(value);
    // ถ้าเวลาจบเดิมไม่มากกว่าเวลาเริ่มใหม่แล้ว ให้รีเซ็ต
    if (endTime && endTime <= value) {
      setEndTime("");
    }
  }
```

- [ ] **Step 3: แทน `<input type="time">` เวลาเริ่ม ด้วย `<select>`**

แทนบล็อก label "เวลาเริ่ม" (บรรทัด 310–320) ด้วย:

```tsx
                  <label className="flex flex-col gap-1 text-sm font-bold text-neutral-700">
                    เวลาเริ่ม
                    <select
                      value={startTime}
                      disabled={!config}
                      onChange={(e) => handleStartChange(e.target.value)}
                      className="rounded-sm border-[1.5px] border-neutral-300 px-3 py-2 font-normal disabled:bg-neutral-150 disabled:text-neutral-400"
                    >
                      <option value="">เลือกเวลา</option>
                      {startOpts.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
```

- [ ] **Step 4: แทน `<input type="time">` เวลาจบ ด้วย `<select>`**

แทนบล็อก label "เวลาจบ" (บรรทัด 321–331) ด้วย:

```tsx
                  <label className="flex flex-col gap-1 text-sm font-bold text-neutral-700">
                    เวลาจบ
                    <select
                      value={endTime}
                      disabled={!config || !startTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="rounded-sm border-[1.5px] border-neutral-300 px-3 py-2 font-normal disabled:bg-neutral-150 disabled:text-neutral-400"
                    >
                      <option value="">เลือกเวลา</option>
                      {endOpts.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
```

- [ ] **Step 5: ตรวจ typecheck + lint + build**

Run: `npm run lint && npx tsc --noEmit`
Expected: ไม่มี error; ยืนยันว่าไม่มีการอ้างอิง `minTime`/`maxTime` ค้าง (ถ้ามีจะ error unused/undefined — ลบให้หมด)

- [ ] **Step 6: ตรวจด้วย preview server**

เริ่ม dev server แล้วเปิดหน้า `/booking`:
- ช่องเวลาเริ่ม dropdown ล่างสุดคือ 16:30 (ไม่มี 17:00)
- เลือกเริ่ม 16:30 → ช่องจบเปิดใช้ได้ มีแค่ 17:00
- ก่อนเลือกเริ่ม ช่องจบ disabled
- เปลี่ยนเริ่มเป็นค่าที่สูงกว่าเวลาจบเดิม → เวลาจบถูกล้าง

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/booking/page.tsx"
git commit -m "feat(booking): replace time inputs with 30-min dropdowns bound to office hours"
```

---

### Task 3: แก้ trigger `validate_booking_hours` (migration 025)

**Files:**
- Create: `supabase/migrations/025_fix_validate_booking_hours.sql`

**Interfaces:**
- Consumes: `system_config.office_start_hour`, `office_end_hour`, `holidays`; trigger `trg_validate_hours` เดิม (ชี้ที่ฟังก์ชันนี้อยู่แล้ว)
- Produces: ฟังก์ชัน `validate_booking_hours()` เวอร์ชันแก้ไข

**หมายเหตุสำคัญ (controller correction):**
- migration ปัจจุบันในโปรเจกต์ไปถึง `024` แล้ว (และมี `015_*` อยู่สองไฟล์) → หมายเลขว่างถัดไปคือ **025** ไม่ใช่ 015
- `016_harden_functions.sql` เคยรัน `ALTER FUNCTION public.validate_booking_hours() SET search_path = public` เป็น security hardening (Supabase advisor) — `CREATE OR REPLACE` ใน Postgres จะ**ล้าง** setting นี้ทิ้ง ดังนั้นต้องใส่ `SET search_path = public` ในนิยามฟังก์ชันใหม่ด้วย มิฉะนั้นจะ regress การ harden

- [ ] **Step 1: ตรวจ migration ปัจจุบันก่อน**

ใช้ MCP tool `list_migrations` ยืนยันสถานะจริง (คาดว่าไปถึง 024) และเลือกหมายเลขว่างถัดไป = 025

- [ ] **Step 2: เขียนไฟล์ migration**

`supabase/migrations/025_fix_validate_booking_hours.sql`:

```sql
-- ============================================================
-- 025_fix_validate_booking_hours.sql
-- แก้ validate_booking_hours() ให้เทียบเวลาเต็มรวมนาที (เดิมเทียบแค่ชั่วโมง)
-- + เพิ่มเช็ค end > start และกันจองข้ามวัน
-- CREATE OR REPLACE เท่านั้น ไม่ DROP (Critical Rule #8)
-- ต้องคง `SET search_path = public` ที่ 016_harden_functions เคยตั้งไว้
-- (CREATE OR REPLACE จะล้าง per-function config ถ้าไม่ระบุซ้ำ)
-- trigger trg_validate_hours เดิมชี้ที่ฟังก์ชันนี้อยู่แล้ว
-- ============================================================
CREATE OR REPLACE FUNCTION validate_booking_hours()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cfg          record;
  booking_date date;
  start_local  timestamp;
  end_local    timestamp;
BEGIN
  SELECT office_start_hour, office_end_hour, holidays
  INTO cfg
  FROM system_config LIMIT 1;

  -- ถ้ายังไม่มี system_config (ช่วง setup) ให้ผ่านไปก่อน
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  start_local := NEW.start_time AT TIME ZONE 'Asia/Bangkok';
  end_local   := NEW.end_time   AT TIME ZONE 'Asia/Bangkok';
  booking_date := start_local::date;

  -- ตรวจวันหยุด (holidays เป็น JSON array ของ date string)
  IF cfg.holidays ? booking_date::text THEN
    RAISE EXCEPTION 'ไม่สามารถจองในวันหยุด: %', booking_date
      USING ERRCODE = 'P0001';
  END IF;

  -- เวลาจบต้องมากกว่าเวลาเริ่ม
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'เวลาจบต้องมากกว่าเวลาเริ่ม'
      USING ERRCODE = 'P0001';
  END IF;

  -- ต้องอยู่ในวันเดียวกัน (กันจองข้ามวันที่ ::time จะเทียบพลาด)
  IF start_local::date <> end_local::date THEN
    RAISE EXCEPTION 'ไม่สามารถจองข้ามวันได้'
      USING ERRCODE = 'P0001';
  END IF;

  -- ตรวจเวลาทำการ (เทียบเวลาเต็มรวมนาที)
  IF start_local::time < make_time(cfg.office_start_hour, 0, 0)
     OR end_local::time > make_time(cfg.office_end_hour, 0, 0)
  THEN
    RAISE EXCEPTION 'อยู่นอกเวลาทำการ (%:00 - %:00 น.)',
      cfg.office_start_hour, cfg.office_end_hour
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
```

- [ ] **Step 3: apply migration**

ใช้ MCP tool `apply_migration` ชื่อ `025_fix_validate_booking_hours` เนื้อหาตาม Step 2

- [ ] **Step 4: ตรวจ advisors**

ใช้ MCP tool `get_advisors` (type `security` และ `performance`) ยืนยันว่าไม่มี issue ใหม่ — โดยเฉพาะต้องไม่มี "function_search_path_mutable" สำหรับ `validate_booking_hours` (ถ้ามีแปลว่าลืมใส่ `SET search_path = public`)

- [ ] **Step 5: Smoke test ด้วย `execute_sql` (rollback ทุกเคส)**

รันทีละ transaction เพื่อยืนยันพฤติกรรม (ต้องมี user/room จริง — ใช้ค่าจาก seed) รูปแบบ:

```sql
-- เคสควรผ่าน: 08:00–17:00
BEGIN;
INSERT INTO bookings (user_id, room_id, title, activity, attendees, start_time, end_time)
VALUES ('<seed_user_id>', '<seed_room_id>', 'test', 'test', 1,
        '2026-08-03T08:00:00+07:00', '2026-08-03T17:00:00+07:00');
ROLLBACK;  -- ควรไม่ error

-- เคสควร RAISE: 16:20–20:16 (บั๊กเดิม)
BEGIN;
INSERT INTO bookings (user_id, room_id, title, activity, attendees, start_time, end_time)
VALUES ('<seed_user_id>', '<seed_room_id>', 'test', 'test', 1,
        '2026-08-03T16:20:00+07:00', '2026-08-03T20:16:00+07:00');
ROLLBACK;  -- ควร error "อยู่นอกเวลาทำการ"

-- เคสควร RAISE: 08:00–17:30 (เดิมบั๊กเทียบแค่ชั่วโมงเลยผ่าน)
BEGIN;
INSERT INTO bookings (user_id, room_id, title, activity, attendees, start_time, end_time)
VALUES ('<seed_user_id>', '<seed_room_id>', 'test', 'test', 1,
        '2026-08-03T08:00:00+07:00', '2026-08-03T17:30:00+07:00');
ROLLBACK;  -- ควร error "อยู่นอกเวลาทำการ"
```

Expected: เคสแรกไม่ error, สองเคสหลัง RAISE `P0001` ตามข้อความไทย (ถ้า `2026-08-03` เป็นวันหยุดใน config ให้เปลี่ยนเป็นวันทำการอื่น)

- [ ] **Step 6: Commit ไฟล์ migration**

```bash
git add supabase/migrations/025_fix_validate_booking_hours.sql
git commit -m "fix(db): validate booking hours by full time, block end<=start and cross-day"
```

---

## Self-Review

**1. Spec coverage:**
- Frontend dropdown 30 นาที + start ตัดค่าสุดท้าย + end > start + disabled เมื่อ config null → Task 1 (logic) + Task 2 (UI) ✓
- รีเซ็ตเวลาจบเมื่อเปลี่ยนเริ่ม → Task 2 Step 2 ✓
- ห้าม hardcode 8–17 อ่านจาก config → Task 1 `buildTimeSlots` รับ hour จาก config ใน Task 2 ✓
- คง state `"HH:MM"` / ไม่แตะ `handleSearch`/`handleSubmit` → Task 2 ไม่แก้สองฟังก์ชันนี้ ✓
- trigger เทียบเวลาเต็มรวมนาที + end>start + กันข้ามวัน + คงข้อความ/ERRCODE/fallback → Task 3 ✓
- ทดสอบ trigger เคส 16:20–20:16, 08:00–17:30, end≤start → Task 3 Step 5 ✓

**2. Placeholder scan:** ไม่มี TBD/TODO; ทุก step มีโค้ด/คำสั่งจริง `<seed_user_id>`/`<seed_room_id>` เป็นค่าที่ต้องแทนจาก seed data จริงตอนรัน (ระบุชัดใน Step 5)

**3. Type consistency:** ชื่อ `buildTimeSlots`, `startOptions`, `endOptions` ตรงกันระหว่าง Task 1 (นิยาม) และ Task 2 (เรียกใช้); state `startTime`/`endTime` string เดิมทุกจุด ✓
