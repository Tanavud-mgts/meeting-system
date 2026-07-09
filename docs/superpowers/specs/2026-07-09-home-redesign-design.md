# ออกแบบใหม่หน้า /home — แดชบอร์ดส่วนตัว + แถบสัปดาห์องค์กร

**สถานะ:** design (ผ่าน brainstorming แล้ว รอ user review ก่อนทำ implementation plan)
**วันที่:** 2026-07-09
**ขอบเขต:** หน้า `app/(app)/home/page.tsx` หน้าเดียว + 1 pure module ใหม่ (`lib/homeWeek.ts`) + unit test

## เป้าหมาย

หน้า `/home` ปัจจุบันเป็นแค่การ์ดกลางจอ "ยินดีต้อนรับ {ชื่อ}" + อีเมล + บทบาท (แสดง role เป็น `user`/`approver`/`admin` ดิบๆ) เหมือนกันทุก role ไม่มีข้อมูลหรือทางลัด — เปลี่ยนเป็น **แดชบอร์ดส่วนตัวแบบ role-aware**: ผู้ใช้เข้ามาเห็นสถานะของตัวเอง (การจองถัดไป, งานที่ค้าง), ภาพรวมตารางองค์กรสัปดาห์นี้, และทางลัดที่เกี่ยวข้องกับบทบาท

## หลักการที่ยึด

- **ไม่มี migration / Edge Function / RLS ใหม่** — อ่านข้อมูลอย่างเดียวจาก view/table ที่ RLS อนุญาตอยู่แล้ว (ยืนยันจากฟีเจอร์ที่ทำงานจริง: `/calendar` อ่าน `booking_detail` ทั้งองค์กรได้ทุก role, `/profile/bookings` กรอง `requester_id`, `/approver` ใช้ `system_config` + `bookings`)
- **ใช้ design token + component เดิมเท่านั้น** (Card, Badge, Avatar, Skeleton, Button, gradient `--gradient-brand`) — ห้าม hardcode สี/spacing (CLAUDE.md ข้อ 10)
- **ข้อความ UI ภาษาไทยทางการ** (CLAUDE.md ข้อ 9)
- **ไม่โหลด FullCalendar ที่ /home** — แถบสัปดาห์ทำเองด้วย CSS/JS ล้วน เพื่อไม่ให้หน้า landing ที่คนเข้าบ่อยสุดแบก bundle หนัก
- **แยก logic วันที่เป็น pure function** ที่ทดสอบได้ (แบบเดียวกับ `lib/nav.ts` + `lib/nav.test.ts`)

## สถาปัตยกรรม

แปลง `app/(app)/home/page.tsx` จาก **server component → client component** (`"use client"`) แบบเดียวกับ `app/(app)/dashboard/page.tsx`:

- auth ถูก guard โดย middleware + `(app)/layout.tsx` (redirect ถ้าไม่มี user) อยู่แล้ว — หน้า home ไม่ต้อง redirect เอง
- โหลดข้อมูลฝั่ง client ด้วย `createClient()` จาก `@/lib/supabase/client`
- แสดง Skeleton ระหว่างโหลด (แบบ /dashboard) แล้วค่อยเรนเดอร์ข้อมูลจริง

### ลำดับการโหลดข้อมูล (ภายใน `useEffect` ครั้งเดียว)

1. `supabase.auth.getUser()` → ถ้าไม่มี ⇒ แสดงข้อความ error (แบบ /profile) ; มี ⇒ เก็บ `user.id`
2. โหลดขนานกันด้วย `Promise.all`:
   - **profile**: `users` select `full_name, role` where `id = user.id` (`.single()`)
   - **การจองถัดไปของฉัน**: `booking_detail` select `id, ref_id, title, final_status, start_time, end_time, room_name` where `requester_id = user.id`, `final_status in (approved, pending)`, `start_time >= <nowISO>`, `order start_time asc`, `limit 1`
   - **คำขอที่รออนุมัติของฉัน (นับ)**: `booking_detail` select `id` `{ count: "exact", head: true }` where `requester_id = user.id`, `final_status = pending`
   - **การจององค์กรสัปดาห์นี้**: `booking_detail` select `start_time, final_status` where `final_status in (approved, pending)`, `start_time >= <weekStartISO>`, `start_time < <weekEndISO>`
   - **system_config**: select `admin_id, approver1_id, approver2_id` (`.single()`) — ใช้หา step ของ chain
3. หลังได้ `system_config`: คำนวณ `myStep` (admin_id→1, approver1_id→2, approver2_id→3, ไม่ตรง→null) แบบเดียวกับ `/approver`
   - ถ้า `myStep !== null` โหลดเพิ่ม: **รอคุณพิจารณา (นับ)** = `bookings` select `id` `{ count:"exact", head:true }` where `final_status = pending` และ `current_step = myStep - 1`
   - ถ้า `myStep === null` ⇒ count = null (ไม่แสดงการ์ดนี้)

> การนับ "รอคุณพิจารณา" ผูกกับ **การเป็นสมาชิก Approval Chain** (มี step) ไม่ผูกกับ `role` — ครอบคลุม admin (step 1) + approver1 (step 2) + approver2 (step 3) และซ่อนสำหรับ user ทั่วไปโดยอัตโนมัติ

### pure module ใหม่: `lib/homeWeek.ts`

แยก logic วันที่ของแถบสัปดาห์ออกมาเป็น pure function ไม่มี React/Supabase เพื่อ unit-test ได้:

```ts
export type WeekDay = {
  date: Date;        // เที่ยงคืนของวันนั้น (local)
  label: string;     // "อา" "จ" "อ" "พ" "พฤ" "ศ" "ส"
  dayOfMonth: number;// 1–31
  isToday: boolean;
  count: number;     // เติมทีหลังด้วย bucketByDay
};

// สัปดาห์เริ่มวันอาทิตย์ (ตามปฏิทินไทยทั่วไป) — 7 วันจากอาทิตย์ล่าสุด
export function buildWeekDays(now: Date): WeekDay[];

// ขอบเขตสัปดาห์ [start, end) เป็น ISO ไว้ยิง query
export function weekRangeISO(now: Date): { startISO: string; endISO: string };

// นับ booking ตามวันในสัปดาห์ (คืน array ใหม่ พร้อม count)
export function bucketByDay(
  days: WeekDay[],
  bookings: { start_time: string }[]
): WeekDay[];
```

- `THAI_WEEKDAY_LABELS = ["อา","จ","อ","พ","พฤ","ศ","ส"]` (index = `getDay()`)
- `buildWeekDays`: หา `startOfWeek` = ย้อนไป `now.getDay()` วันแล้วตั้งเวลา 00:00:00.000 → สร้าง 7 วัน; `isToday` เทียบ `date` กับวันปัจจุบัน (ระดับวัน)
- `weekRangeISO`: `startISO` = startOfWeek, `endISO` = startOfWeek + 7 วัน → ใช้กรอง `start_time >= startISO AND start_time < endISO`
- `bucketByDay`: สำหรับแต่ละ booking แปลง `new Date(start_time)` แล้วหา index วัน (0–6) เทียบกับ startOfWeek, เพิ่ม `count` ของวันนั้น (ข้าม booking ที่ตกนอกช่วง 0–6 กันพลาด)

## องค์ประกอบหน้า (บนลงล่าง)

container: `mx-auto max-w-2xl animate-fade-in-up p-6` (ตรงกับหน้าอื่น)

### 1. Header แบรนด์ (ทุก role)
กล่อง gradient แบบเดียวกับหน้า `/profile` (`overflow-hidden rounded-lg shadow-card` + inner `flex items-center gap-4 p-5` `style={{ background: "var(--gradient-brand)" }}`):
- `<Avatar name={full_name} size="lg" tone="inverse" />`
- ชื่อ (`text-lg font-semibold text-text-on-primary`) + คำทักทาย "ยินดีต้อนรับ"
- Badge บทบาท **ภาษาไทย** ผ่าน `ROLE_LABEL` map (`user→ผู้ใช้ทั่วไป`, `approver→ผู้อนุมัติ`, `admin→ผู้ดูแลระบบ`) — แก้บั๊กที่เดิมโชว์ role ดิบ

### 2. การ์ดสถานะของฉัน (ทุก role)
- **"การจองถัดไปของฉัน"** (Card): ถ้ามี → `title` + `ห้อง {room_name}` + ช่วงเวลา `toLocaleString("th-TH", {dateStyle:"medium", timeStyle:"short"})` + `<Badge>` สถานะ (reuse `STATUS_LABEL`/`STATUS_TONE`: pending→warning "รออนุมัติ", approved→success "อนุมัติแล้ว"); ถ้าไม่มี → ข้อความ muted "ยังไม่มีการจองที่กำลังจะถึง"
- **"คำขอที่รออนุมัติของฉัน"** (Card): ตัวเลข `count.toLocaleString("th-TH")` (label `text-sm text-text-secondary` + เลข `text-xl font-semibold`)
- **ปุ่ม "จองห้องประชุม"** → `Link href="/booking"` (ปุ่ม primary; ใช้ `Button` หรือ Link styled แบบปุ่มหลัก)

### 3. การ์ดตามบทบาท
- **ถ้าอยู่ใน chain** (`waitingCount !== null`): การ์ดไฮไลต์พื้น warning (แบบการ์ดแจ้งเตือนหน้า /dashboard) **"รอคุณพิจารณา {count} รายการ"** + hint "ไปหน้าคำขออนุมัติ →" → `Link href="/approver"`
- **ถ้า role === admin**: การ์ดทางลัด **"ภาพรวมระบบ"** → `Link href="/dashboard"` (การ์ดปกติ + ลูกศร)

### 4. แถบ "สัปดาห์นี้" (ทุก role)
Card ครอบ grid 7 คอลัมน์ (`grid grid-cols-7 gap-1` หรือ gap-2):
- แต่ละช่อง: label วัน (`text-xs text-text-secondary`) + เลขวันที่ + ตัวเลขจำนวนการจอง (ถ้า `count>0` เน้น `text-brand-primary font-semibold`; ถ้า 0 แสดง "—" muted)
- **วันนี้ไฮไลต์**: พื้น `bg-nav-active-surface` + ตัวเลขวันที่เข้ม (ใช้ token ที่เพิ่งเพิ่ม)
- หัวข้อการ์ด: "ตารางการจองสัปดาห์นี้" (`text-sm font-medium`)

### 5. ปุ่ม "ดูปฏิทินทั้งหมด →"
`Link href="/calendar"` สไตล์ ghost/secondary ใต้แถบสัปดาห์

## Loading / Error states
- ระหว่างโหลด: Skeleton แทน header + การ์ด + แถบสัปดาห์ (แบบ /dashboard, /profile) — ไม่โชว์จอว่าง
- โหลด profile ไม่ได้: ข้อความ `text-danger-text` "ไม่สามารถโหลดข้อมูลหน้าหลักได้" (ไม่ throw)
- query ย่อยล้มเหลว: ถือว่าไม่ critical — แสดงค่าที่มี, ส่วนที่พังโชว์ fallback (เช่น การจองถัดไป = ข้อความว่าง, แถบสัปดาห์ = ทุกวัน 0) ไม่ทำทั้งหน้าพัง

## ไฟล์ที่แตะ

| ไฟล์ | การเปลี่ยน |
|---|---|
| `lib/homeWeek.ts` (ใหม่) | pure functions: `THAI_WEEKDAY_LABELS`, `buildWeekDays`, `weekRangeISO`, `bucketByDay` + type `WeekDay` |
| `lib/homeWeek.test.ts` (ใหม่) | Vitest unit tests (ดู "การทดสอบ") |
| `app/(app)/home/page.tsx` (เขียนใหม่) | server → client component; โหลดข้อมูล role-aware; เรนเดอร์ header + การ์ดสถานะ + การ์ดตาม role + แถบสัปดาห์ + ลิงก์ปฏิทิน |

reuse (ไม่แก้): `components/ui/{Card,Badge,Avatar,Skeleton,Button}.tsx`, `lib/supabase/client.ts`, token `--gradient-brand` / `--color-nav-active-surface`

## การทดสอบ

**Unit (Vitest, `lib/homeWeek.test.ts`)** — เพิ่มใน glob `lib/**/*.test.ts` ที่ `vitest.config.ts` ครอบอยู่แล้ว:
- `buildWeekDays` คืน 7 วัน, วันแรก `getDay()===0` (อาทิตย์), label ตรง index
- `buildWeekDays` ตั้ง `isToday` ที่วันปัจจุบันเพียงวันเดียว
- `weekRangeISO`: `endISO - startISO` = 7 วันพอดี; `startISO` เป็นเที่ยงคืนวันอาทิตย์
- `bucketByDay`: booking หลายอันในวันเดียวกันนับรวมถูก; booking นอกช่วงถูกข้าม; วันที่ไม่มี booking count=0
- เคส cross-locale/ข้ามเดือน: ป้อน `now` ที่เป็นวันเสาร์ → สัปดาห์ยังเริ่มอาทิตย์ที่ผ่านมาถูกต้อง

**Live (preview, local dev)** — ตามรูปแบบเดิมทุก role (clear cookie ก่อน login ทุกครั้ง กัน session ค้าง):
1. `user@test.local`: header ชื่อ+badge "ผู้ใช้ทั่วไป"; การจองถัดไป/คำขอที่รอ; ปุ่มจองห้อง; แถบสัปดาห์มีตัวเลของค์กร วันนี้ไฮไลต์; ปุ่มไปปฏิทิน; **ไม่มี**การ์ด "รอคุณพิจารณา"/"ภาพรวมระบบ"
2. `approver1@test.local`: **มี**การ์ด "รอคุณพิจารณา N"; **ไม่มี** "ภาพรวมระบบ"
3. `admin@test.local`: **มี**ทั้ง "รอคุณพิจารณา N" (admin = step 1) และ "ภาพรวมระบบ"
4. ตรวจ `tsc --noEmit` + `npm run build` ผ่าน; ลิงก์ทุกปุ่มไปหน้าถูกต้อง

## นอกขอบเขต (YAGNI)
- ไม่ทำวันในแถบสัปดาห์ให้คลิกได้รายวัน (มีปุ่ม "ดูปฏิทินทั้งหมด" พอ)
- ไม่ deep-link ปฏิทินไปวันที่เจาะจง
- ไม่แยกสี approved/pending ในแถบสัปดาห์ (นับรวมพอ)
- ไม่แตะ `/calendar`, `/dashboard`, `/approver` เดิม
