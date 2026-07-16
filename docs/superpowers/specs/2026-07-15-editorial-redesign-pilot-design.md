# Editorial Redesign — งานนำร่องหน้า `/approver`

**วันที่:** 2026-07-15
**สถานะ:** Design (รออนุมัติ implementation plan)
**ขอบเขต:** นำร่อง 1 หน้า (`/approver`) + primitive ใหม่ที่ใช้ซ้ำได้ + โลโก้คณะ — ก่อนขยายทั้งระบบ

---

## 1. เป้าหมายและบริบท

### ปัญหา
UI ปัจจุบันของระบบจองห้องประชุม (LPRU / คณะวิทยาการจัดการ) อ่านว่าเป็น "AI slop" จากสัญญาณ 4 อย่างที่ผู้ใช้ยืนยัน:
1. Gradient hero ซ้ำกันทั้ง 18 หน้า
2. การ์ด rounded-lg + เงา เหมือนกันหมดทุกที่
3. ปุ่ม/badge/pill gradient เยอะ
4. ขาดเอกลักษณ์เฉพาะหน่วยงาน

### หลักการแก้ (ตัดสินใจแล้ว)
- **เก็บพาเลตต์สีเดิม 100%** (ม่วง `#7c3aed` / เทอร์คอย `#0891b2` / เขียว `#059669` บน lavender `#f2effa`) — ปัญหาอยู่ที่ *วิธีใช้สี* ไม่ใช่ตัวสี
- ทิศทาง: **Editorial grid (Swiss/editorial)** — กริดชัด, เส้น hairline 1px จัดโครงสร้าง, mono สำหรับข้อมูลเชิงเทคนิค, gradient เหลือบทบาท accent
- ทำ **หน้านำร่องเดียวก่อน** (`/approver`) เพื่อพิสูจน์ pattern แล้วค่อยขยาย

### ทำไมเลือก `/approver` เป็นหน้านำร่อง
เป็นหน้าที่ข้อมูลหนาแน่นที่สุด — มี ref ID, วันเวลา, ตารางข้อมูล, approval chain, badge สถานะ, ปุ่ม action, dialog ครบทุก pattern ที่ต้องเอาไปใช้หน้าอื่น ถ้า editorial grid เวิร์คบนหน้านี้ได้ = พิสูจน์ทั้งระบบ

---

## 2. Editorial Primitives (ของใหม่ ใช้ซ้ำได้)

สร้างใน `components/ui/` เป็น source of truth สำหรับการขยายหน้าอื่นในอนาคต

### 2.1 `EditorialCard` — `components/ui/EditorialCard.tsx`
การ์ดสไตล์ editorial แทน `Card` เดิมในบริบทที่ต้องการโครงสร้างเป็น section

- มุมเหลี่ยม: `border-radius` = `2px` (เกือบเหลี่ยม แต่ไม่คมจนกระด้าง) — ไม่ใช้ `radius-lg` (16px)
- ขอบ: `1px solid` `border-strong` (เข้มกว่า hairline ปกติเล็กน้อย) แทน `border-neutral-200` + `shadow-card`
- **ไม่มี shadow** (เลิก `shadow-card`/`hover:shadow-raised`) — โครงสร้างมาจากเส้น ไม่ใช่เงา
- แบ่ง section ภายในด้วยเส้น hairline (`border-b` ระหว่าง block) แทนการเว้น padding ลอยๆ
- รองรับ `accent` prop เดิม (brand/warning/success/danger) แต่แสดงเป็น **แถบ accent ซ้าย 3px** (ไม่ใช่ border-top 5px แบบโค้ง)

โครง API (คง pattern เดิมของ `Card` เพื่อสลับง่าย):
```tsx
<EditorialCard accent="brand">        // แถบ accent ซ้าย
  <EditorialCard.Header>...</EditorialCard.Header>   // section คั่น hairline
  <EditorialCard.Section>...</EditorialCard.Section>
</EditorialCard>
```
> หมายเหตุ implementation: ถ้า compound component เพิ่มความซับซ้อนเกินจำเป็นสำหรับนำร่อง ให้ทำ `EditorialCard` เป็น container เดียว แล้วใช้ `<div className="border-b ...">` ตรงๆ ในหน้า — ตัดสินตอนเขียน plan โดยยึด YAGNI

### 2.2 `FieldTable` — `components/ui/FieldTable.tsx`
ตาราง label/value ที่ align คอลัมน์ตรงกัน แทน `grid gap-x-4 gap-y-1.5` ที่กระจัดกระจาย

- 2 คอลัมน์: label (ซ้าย, สีจาง `text-muted`, กว้างคงที่) │ value (ซ้าย, `text-primary`)
- แต่ละแถวคั่นด้วย hairline บาง (`border-b border-neutral-150`) — แถวสุดท้ายไม่มีเส้น
- value ที่เป็นข้อมูลเชิงเทคนิค (ref ID, วันเวลา) ใช้ `font-mono`
- รับข้อมูลเป็น array ของ `{ label, value, mono? }`

```tsx
<FieldTable rows={[
  { label: "ผู้จอง", value: "สมชาย ใจดี · กองกลาง" },
  { label: "วันเวลา", value: "20 ก.ค. 2569 09:00–11:00 น.", mono: true },
  { label: "ผู้เข้าร่วม", value: "12 คน" },
]} />
```

### 2.3 `StatusMarker` — `components/ui/StatusMarker.tsx`
Swatch สี่เหลี่ยม 9px + ข้อความ สำหรับสถานะในบริบทตาราง/รายการ (แทน pill ใหญ่)

- swatch: `9px × 9px` สี่เหลี่ยม (ไม่ใช่วงกลม/pill) สีตาม tone
- ข้อความข้างๆ: `text-sm`, สีตาม tone
- tone เดียวกับ `Badge` เดิม: success/warning/danger/neutral
- **`Badge` (pill) เดิมยังอยู่** — ใช้ต่อในบริบทหัวข้อ/dialog/hero ที่ pill เหมาะกว่า; `StatusMarker` ใช้ในตารางและ list dense

```tsx
<StatusMarker tone="warning">รอ ผู้อนุมัติ 1 · ขั้น 2/3</StatusMarker>
```

### 2.4 `Brand` — `components/ui/Brand.tsx`
โลโก้คณะ + wordmark ใช้ทั้ง sidebar และหน้า public

- ไฟล์โลโก้: `public/logo-fms.svg` (preferred) หรือ `public/logo-fms.png` (พื้นโปร่ง)
- ถ้าไฟล์ยังไม่มีตอน implement → ใส่ inline SVG placeholder (วงกลม + ข้อความ "FMS") ชั่วคราวเพื่อไม่ให้เลย์เอาต์พัง
- 2 ขนาดผ่าน prop `size`: `"sm"` (~30px, sidebar) / `"lg"` (~64px, public pages)
- wordmark 2 ระดับ:
  - บรรทัด 1: **ระบบจองห้องประชุม**
  - บรรทัด 2: **คณะวิทยาการจัดการ มหาวิทยาลัยราชภัฏลำปาง**
- ตัวเลือก `showWordmark` (sidebar = true; บาง context อาจโลโก้อย่างเดียว)

```tsx
<Brand size="sm" />                    // sidebar
<Brand size="lg" />                    // login/setup/welpru — จัดกลาง
```

---

## 3. Hero + นโยบายการใช้สี (Editorial)

### 3.1 Hero — เตี้ยลง เลิก overlap
เปลี่ยนพฤติกรรม `PageHero` (หรือสร้าง variant) สำหรับหน้าในแอป:

- **เดิม:** แบนเนอร์ gradient สูง (`pb-12 pt-8`) + `hero-glow` + การ์ดแรกซ้อน `-mt-6`
- **ใหม่:** แถบหัวเรื่องเตี้ยลง — `h1` นำด้วย **accent bar ม่วงแนวตั้ง** (ขยายบทบาท `section-bar` เดิม), ปิดล่างด้วยเส้น `1px border-strong`, **เลิก `-mt-6` overlap** — เนื้อหาเริ่มใต้เส้นตรงๆ
- gradient ไม่หายไปจากระบบ แต่ในบริบท hero กลายเป็น accent bar ไม่ใช่พื้นเต็มผืน
- **หน้า public (login/setup/welpru)** ยังคงพื้น `bg-grad-hero` เต็มได้ (เป็นหน้า splash จุดเดียว ไม่ซ้ำ 18 หน้า) — โลโก้ `lg` จัดกลางเหนือการ์ด

> การตัดสิน: hero ในแอป = เตี้ย+accent; hero หน้า public = gradient เต็มคงเดิม (ผู้ใช้ยืนยัน hero-เตี้ยลง+เลิก overlap สำหรับหน้าในแอป)

### 3.2 นโยบายสีทั้งหน้า
| องค์ประกอบ | เดิม | ใหม่ (Editorial) |
|---|---|---|
| Hero (ในแอป) | gradient เต็ม + glow + overlap | แถบเตี้ย + accent bar ม่วง + เส้นล่าง |
| ม่วง | ปุ่ม/chip/hero/เมนู เต็มไปหมด | accent bar หัวข้อ + ปุ่ม primary เดียว/หน้า + เส้น chain |
| สถานะ | pill พื้นสีเต็ม | `StatusMarker` swatch เล็ก + ข้อความ (pill เหลือใช้หัวข้อ/dialog) |
| Filter chip active | `bg-grad-brand` เต็ม + shadow | ขอบ/underline ม่วงหนา ไม่มี gradient |
| พื้นที่เหลือ | การ์ดโค้ง + เงา | ขาว/lavender + เส้น hairline เทา |

### 3.3 Typography — 3 roles
- `h1` (หัวหน้า) — `text-3xl font-extrabold`
- `SectionTitle` (หัว section) — `text-lg font-extrabold` + accent bar (ใช้ให้ครบ ไม่ใช้ `<p font-medium>` แทน)
- body — `text-base`
- **mono** (`font-mono`) — ref ID, วันเวลา, timestamp เท่านั้น

---

## 4. โครงหน้า `/approver` ใหม่

ลำดับจากบนลงล่าง:

1. **หัวหน้า** — hero เตี้ย: accent bar + `h1` "คำขออนุมัติ" + subtitle (จำนวนรออนุมัติ), เส้นปิดล่าง, ไม่ overlap
2. **Filter chips** — 3 chip (รอ/อนุมัติแล้ว/ปฏิเสธแล้ว), active = ขอบม่วงหนา + ตัวนับ
3. **การ์ดคิว** (`EditorialCard`, แถบ accent ซ้าย — brand ปกติ / warning ถ้า urgent >2ชม.):
   - **Header** (คั่น hairline): ชื่อห้อง (`text-lg`) + `StatusMarker` "รออนุมัติ" ┄ ref ID (`font-mono`, ชิดขวา) + เวลารอ ("รอมาแล้ว X")
   - **แถวชื่อเรื่อง** (คั่น hairline): `text-md font-bold`
   - **`FieldTable`**: ผู้จอง │ วันที่ │ เวลา (mono) │ ผู้เข้าร่วม
   - **ApprovalChain** (ของเดิม — ปรับให้เข้ากับเส้น hairline, คง logic done/current/wait)
   - **Footer segmented**: ปุ่ม รายละเอียด │ ปฏิเสธ │ อนุมัติ คั่นด้วยเส้น 1px (ปุ่ม primary เดียว = อนุมัติ)
4. **การ์ดที่พิจารณาแล้ว** (แท็บ approved/rejected) — โครงเดียวกัน accent success/danger
5. **Dialog รายละเอียด + Dialog ยืนยัน** — `Modal` เดิม, ปรับภายในใช้ `FieldTable` + hairline; ยืนยันคง icon วงกลม gradient (accent จงใจ)

---

## 5. สิ่งที่คงไว้ (ไม่แตะ — behavior preservation)

- **ตรรกะทั้งหมด:** `loadQueue()`, การหา `myStep` จาก `system_config`, edge function `approve-booking`, การกรอง `final_status`/`current_step`, การโหลด `approval_logs`
- **ค่าสี token ทุกตัว** ใน `tokens/` และ `globals.css` — เพิ่ม pattern ใหม่ ไม่แก้ค่าเดิม
- **ข้อความไทยราชการ** ทั้งหมด
- **`Badge`, `Button`, `Modal`, `Card` เดิม** — ยังอยู่ ใช้ควบคู่ (ไม่ลบ) เพื่อไม่กระทบหน้าอื่นที่ยังไม่ได้ยกเครื่อง
- **RLS, การแยกสิทธิ์ตาม role, race-condition guard** — ไม่เกี่ยวกับงานนี้

---

## 6. Deliverables

1. `components/ui/EditorialCard.tsx` (+ sub-parts ถ้าจำเป็น)
2. `components/ui/FieldTable.tsx`
3. `components/ui/StatusMarker.tsx`
4. `components/ui/Brand.tsx`
5. ปรับ `PageHero` — เพิ่ม variant เตี้ย/ไม่ overlap (หรือ prop) โดยไม่ทำหน้าอื่นพัง
6. ยกเครื่อง `app/(app)/approver/page.tsx` เป็น Editorial B
7. ใส่ `Brand` ใน `app/(app)/AppNav.tsx` (sidebar + drawer mobile)
8. ใส่ `Brand size="lg"` ใน `app/login/page.tsx`, `app/setup/page.tsx`, `app/welpru-verify/page.tsx`
9. อัปเดต `docs/DESIGN.md` — เพิ่ม section "Editorial patterns" (EditorialCard, FieldTable, StatusMarker, hero variant, นโยบายสี)
10. รันแอปดูผลจริง (preview) ก่อนสรุปงานนำร่อง

### ต้องการจากผู้ใช้
- ไฟล์โลโก้ `public/logo-fms.svg` หรือ `public/logo-fms.png` (พื้นโปร่ง) — ถ้ายังไม่มี implementation ใช้ placeholder ชั่วคราว

---

## 7. เกณฑ์ความสำเร็จ (verifiable)

- [ ] หน้า `/approver` เรนเดอร์ได้ ไม่มี error, ปุ่มอนุมัติ/ปฏิเสธ/รายละเอียดยังทำงานครบ (เรียก edge function เดิม)
- [ ] ไม่มี gradient เต็มผืนในหน้า `/approver` นอกจาก accent bar + ปุ่ม primary + icon dialog
- [ ] ref ID และวันเวลาแสดงด้วย `font-mono`
- [ ] ข้อมูลการจองจัดเป็น `FieldTable` คอลัมน์ align กัน คั่น hairline
- [ ] โลโก้ + wordmark 2 ระดับปรากฏใน sidebar และหน้า public 3 หน้า
- [ ] ค่าสี token ไม่ถูกแก้ (diff `tokens/` = เฉพาะเพิ่ม ไม่แก้ค่าเดิม)
- [ ] responsive: sidebar 200px (desktop) / bottom nav + drawer (mobile) ยังทำงาน
- [ ] `docs/DESIGN.md` มี section Editorial patterns
