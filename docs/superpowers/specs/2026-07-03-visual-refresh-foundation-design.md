# Visual Refresh — Foundation (sub-project A ของ 2)

## บริบท

ผู้ใช้ต้องการปรับปรุงการแสดงผลของระบบทั้งหมดให้ดูทันสมัยขึ้น — สีสันสดใสแบบ SaaS สมัยใหม่ (เขียว-เทอร์คอยสดใส), เงา (shadow) นุ่มนวลที่เด่นขึ้นตอน hover, และ animation (hover/transition, fade-in ตอนโหลดหน้า, modal เด้งเข้า, loading skeleton)

**ข้อค้นพบสำคัญจากการสำรวจ:** `docs/DESIGN.md` มี token `--shadow-card`/`--shadow-raised`/`--shadow-modal` และ pattern `.card:hover { box-shadow: var(--shadow-raised); }` ถูกออกแบบไว้ตั้งแต่ต้นอยู่แล้ว (มี boxShadow wired เข้า Tailwind config เรียบร้อย) **แต่ไม่เคยถูกนำไปใช้จริงในหน้าไหนเลยสักหน้าใน 16 หน้าที่มีอยู่** — งานนี้จึงเป็นทั้งการ "ทำตาม design ที่ตั้งใจไว้เดิมแต่ตกหล่น" (shadow) ผสมกับ "ปรับทิศทางใหม่จริง" (สีสด, animation ที่ไม่เคยมี)

โปรเจกต์นี้มี 16 หน้าทั้งหมด — ขนาดใหญ่เท่า 1 Track จึงแบ่งเป็น 2 sub-project:
- **Sub-project A (spec นี้):** Token ใหม่ + สร้าง shared component 5 ตัว + apply กับ 4 หน้าหลัก (`/home`, `/booking`, `/dashboard`, `/approver`)
- **Sub-project B (ทำต่อหลัง A เสร็จ):** Roll out ไปยังอีก 12 หน้าที่เหลือ

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- อัปเดตค่า color token ใน `docs/DESIGN.md` + `app/globals.css` (ไม่เปลี่ยนชื่อ CSS variable เดิม)
- เพิ่ม transition token ใหม่ (ไม่เคยมีมาก่อน)
- สร้าง `components/ui/Card.tsx`, `Button.tsx`, `Badge.tsx`, `Modal.tsx`, `Skeleton.tsx`
- Apply component ใหม่กับ `/home`, `/booking`, `/dashboard`, `/approver` เท่านั้น (4 หน้า)

**ไม่อยู่ในขอบเขตนี้:**
- อีก 12 หน้าที่เหลือ — เก็บไว้ให้ sub-project B
- ไม่แตะ business logic, Edge Function, หรือ data fetching ใดๆ เลย (เป็น visual layer ล้วน)
- ไม่เพิ่ม animation library ภายนอก (เช่น framer-motion) — ใช้ Tailwind utility + CSS keyframe เท่านั้น

## สถาปัตยกรรม / Components

### 1. Design Tokens (`docs/DESIGN.md` + `app/globals.css`)

- **สี**: เปลี่ยนค่า `--color-brand-primary` จาก `#15727d` (teal เข้มหม่น) เป็นเขียว-เทอร์คอยสดใสขึ้น `#0d8a5f`, `--color-brand-primary-strong` เป็น `#0a6b48`, เพิ่ม `--gradient-brand: linear-gradient(135deg, #0d8a5f, #10b981)` สำหรับใช้กับปุ่ม/ไฮไลต์พิเศษ — **ไม่เปลี่ยนชื่อ CSS variable เดิม** หน้าที่ใช้ `bg-brand-primary` อยู่แล้วได้สีใหม่อัตโนมัติ
- **Shadow**: ใช้ `--shadow-card`/`--shadow-raised`/`--shadow-modal` ที่มีอยู่แล้วตรงๆ (ไม่ต้องสร้างใหม่) — แค่นำไปใช้จริงใน Card component
- **Transition (ใหม่)**: เพิ่ม `--transition-base: 150ms ease` ใน `app/globals.css` และ mapping เข้า Tailwind ผ่าน `transitionDuration`/`transitionTimingFunction` custom values

### 2. Shared Components (`components/ui/`)

- **`Card.tsx`** — `className="rounded-lg border border-neutral-200 bg-surface-card p-5 shadow-card transition-shadow hover:shadow-raised"` รับ `children`, optional `className` เพิ่มเติม (merge กับ default)
- **`Button.tsx`** — prop `variant: "primary" | "secondary" | "danger"`, ทุก variant มี `transition-transform hover:scale-[1.02] active:scale-[0.98]`, primary ใช้ `bg-brand-primary hover:bg-brand-primary-strong`
- **`Badge.tsx`** — prop `tone: "success" | "warning" | "danger" | "neutral"`, สืบทอด logic เดียวกับที่เพิ่งเพิ่มใน `/dashboard/bookings`/`/profile/bookings` (จะไป refactor 2 ไฟล์นั้นให้ใช้ `Badge` component แทน `STATUS_BADGE_CLASS` local แทน)
- **`Modal.tsx`** — wrapper รับ `open: boolean`, `onClose: () => void`, `children` ใช้ `shadow-modal` (มีอยู่แล้ว) + keyframe `scale-fade-in` (scale 0.95→1, opacity 0→1, ~150ms) ตอนเปิด
- **`Skeleton.tsx`** — `<div className="animate-pulse rounded-lg bg-neutral-150" />` รับ `className` กำหนดขนาด (Tailwind `animate-pulse` มีอยู่แล้วในตัว ไม่ต้องเขียน keyframe เอง)

### 3. Page-load fade-in

เพิ่ม keyframe `fade-in-up` ใน `app/globals.css` (`@keyframes fade-in-up { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }`) + utility class `.animate-fade-in-up` — ใส่ที่ container หลักของแต่ละหน้าในสโคป (`<div className="... animate-fade-in-up">`)

## Data Flow

ไม่มีการเปลี่ยน data flow ใดๆ — เป็นการเปลี่ยน presentation layer ล้วน component ใหม่รับ props ที่มีอยู่แล้วจาก state เดิมของแต่ละหน้า

## Error Handling

ไม่มี error state ใหม่เกิดขึ้นจากงานนี้ — Card/Button/Badge/Modal/Skeleton เป็น presentational component ล้วน ไม่มี logic ที่ fail ได้

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน
2. ทดสอบสดผ่าน browser ทั้ง 4 หน้าในสโคป (`/home`, `/booking`, `/dashboard`, `/approver`) ทั้ง desktop และ mobile — เห็นสีใหม่, shadow เด่นขึ้นตอน hover, ปุ่มมี scale animation ตอน hover/click, หน้าโหลดมี fade-in
3. `/dashboard/bookings` และ `/profile/bookings` (ที่เพิ่งแก้ badge ไปในรอบก่อน) ยังแสดง badge สีถูกต้องเหมือนเดิมหลัง refactor ไปใช้ `Badge` component ใหม่ — ไม่มี regression
4. 12 หน้าที่เหลือนอกสโคป (ยังไม่ migrate) ต้องแสดงผลได้ปกติเหมือนเดิม ไม่พังเพราะ token เปลี่ยนค่า (ตรวจผ่าน browser สุ่ม 2-3 หน้า)
