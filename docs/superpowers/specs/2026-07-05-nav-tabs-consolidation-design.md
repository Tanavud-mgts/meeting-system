# Navigation Tab Consolidation — Design

## บริบท

Navigation ของระบบจองห้องประชุม LPRU แสดงเมนูแบบ flat หนึ่งรายการต่อหนึ่งหน้า ทำให้ **admin เห็นเมนูมากถึง 17 รายการ** ในแถบข้าง อ่านยากและหาเมนูลำบาก หลายหน้าทำงานในหมวดเดียวกัน (งานอนุมัติหลายชนิด, หน้าจัดการหลายอย่าง, หน้ารายงาน/ข้อมูลหลายหน้า) ควรยุบให้เหลือ ~8 เมนูโดยรวมหน้าที่เกี่ยวข้องเป็น "แท็บ" ในกลุ่มเดียวกัน

## ขอบเขต

**อยู่ในขอบเขต:**
- สร้าง `components/ui/Tabs.tsx` (แถบแท็บ navigation ชั้นสอง)
- นิยาม config กลาง `NAV_GROUPS` ใน `app/(app)/layout.tsx`
- ปรับ sidebar / drawer / bottom-nav ให้แสดง group entry แทนรายการหน้าแยก
- แสดงแถบแท็บอัตโนมัติจาก layout เมื่อ route ปัจจุบันอยู่ในกลุ่ม

**ไม่อยู่ในขอบเขต:**
- ไม่ย้าย/เปลี่ยน route เดิม (ทุกหน้ายังอยู่ path เดิม 100%)
- ไม่แตะโค้ดในหน้าเพจทั้ง 12 หน้า
- ไม่แตะหน้า `/calendar` (ใช้ปฏิทินเดิม)
- Profile/Users expansion — เลื่อนไป brainstorm รอบถัดไป

## สถาปัตยกรรม (routing = URL จริง)

จุดตัดสินหลัก: **แต่ละแท็บคือ URL จริง** (route เดิม) แถบแท็บเป็นแค่ navigation ชั้นสองที่ลิงก์ข้ามระหว่าง route ในกลุ่มเดียวกัน → bookmark/แชร์ลิงก์/ปุ่ม back ทำงานถูก, middleware กัน role รายแท็บได้ (route ไม่เปลี่ยน)

วางแถบแท็บที่ **layout ชั้นเดียว** (แนวทาง A) — ไม่แตะหน้าเพจ:

### 1. Config `NAV_GROUPS` (ใน `app/(app)/layout.tsx`)

โครงสร้าง: `standalone items` + `groups` โดยแต่ละ tab มี role ของตัวเอง

- **Standalone** (แสดงตาม role เดิมที่ `navForRole` คำนวณ):
  - user: หน้าหลัก(`/home`), จองห้อง(`/booking`), ปฏิทิน(`/calendar`), การจองของฉัน(`/profile/bookings`), โปรไฟล์(`/profile`)
  - approver เพิ่ม: รายงาน(`/dashboard/reports`) — standalone (ดูเคสพิเศษ)
- **Group "งานอนุมัติ"** (approver, admin): รออนุมัติ(`/approver`) · คำขอยกเลิก(`/approver/cancel-requests`) · ประวัติ(`/approver/history`)
- **Group "จัดการระบบ"** (admin): ห้อง(`/dashboard/rooms`) · ผู้ใช้(`/dashboard/users`) · ตั้งค่า(`/dashboard/settings`)
- **Group "รายงานและข้อมูล"** (admin): ภาพรวม(`/dashboard`) · รายงาน(`/dashboard/reports`) · การจองทั้งหมด(`/dashboard/bookings`) · Integration(`/dashboard/integrations`) · ประวัติรวม(`/dashboard/activity`) · Export(`/dashboard/data`)

ผลลัพธ์จำนวนเมนูใน sidebar: **admin 8** (5 standalone + 3 group), **approver 7** (6 standalone + 1 group), **user 5** (เท่าเดิม)

**สำคัญ — การประกอบเมนูเป็นแบบ role-specific ไม่ใช่ concat แบบเดิม:** ปัจจุบัน `navForRole` ต่อ block (user→approver→admin) แบบสะสม ทำให้ admin ได้ทุกอย่างของ approver รวมถึง "รายงาน" standalone ด้วย ในดีไซน์ใหม่ต้องเขียนการประกอบใหม่ให้ **"รายงาน" ปรากฏที่เดียวต่อ role** — approver = standalone, admin = แท็บใน "รายงานและข้อมูล" (admin **ไม่มี** standalone รายงาน) ระวังอย่าให้ซ้ำ 2 ที่สำหรับ admin

### 2. `components/ui/Tabs.tsx` (component ใหม่)

- Prop: `tabs: { label: string; href: string }[]`
- แถบลิงก์แนวนอน (`next/link`), ไฮไลต์แท็บ active โดยเทียบ `usePathname()` กับ `href`
- เลื่อนแนวนอนได้บนจอแคบ (`overflow-x-auto`)
- ใช้ design token เดิม (border-bottom active = `brand-primary`, ข้อความ token) — client component

### 3. `<PageTabs />` (client, render ใน layout)

- อ่าน `usePathname()` → หากลุ่มที่มี tab ตรงกับ pathname **และ** role ผู้ใช้ผ่าน
- ถ้าเจอ → filter tabs ตาม role แล้ว render `<Tabs>` (แสดงเฉพาะเมื่อมี ≥ 2 แท็บที่เข้าถึงได้)
- ถ้าไม่เจอ / แท็บเดียว → ไม่แสดงอะไร
- รับ `role` จาก layout (server) ส่งลงมาเป็น prop (layout รู้ role อยู่แล้ว)

### 4. Sidebar / drawer / bottom-nav (`AppNav.tsx`)

- แสดง standalone items + group entry (group entry ลิงก์ไปแท็บแรกของกลุ่ม)
- group entry ไฮไลต์ active เมื่อ pathname อยู่ในหน้าลูกใดๆ ของกลุ่ม
- bottom-nav (มือถือ) = 4 รายการแรกของ nav ที่ประกอบแล้ว (เหมือนเดิม)

### 5. Middleware `ROUTE_ROLES`

- **ไม่เปลี่ยน** (route เดิมทั้งหมด) — ยืนยันเพียงว่า role ของแต่ละ route ตรงกับ role ที่กำหนดใน NAV_GROUPS (ตอนนี้ตรงอยู่แล้ว: /approver=approver+admin, /dashboard/*=admin, /dashboard/reports=approver+admin)

## เคสพิเศษที่ตัดสินแล้ว

**"รายงาน" (`/dashboard/reports`)** อยู่ทั้งใน standalone (approver) และ group "รายงานและข้อมูล" (admin):
- approver: เห็นเป็นเมนู standalone "รายงาน" (การทำเป็นแท็บเดี่ยวไม่มีประโยชน์)
- admin: เห็นเป็นแท็บใน "รายงานและข้อมูล"
- เป็น route เดียวกัน — PageTabs จะแสดงแถบแท็บ 6 อันเฉพาะ admin (group เป็น admin-only) ส่วน approver เข้าหน้าเดียวกันได้แต่ไม่เห็นแถบแท็บ → ถูกต้องตาม UX

## Data Flow

ไม่มีการเปลี่ยน data flow — เป็น presentation/navigation layer ล้วน ทุกหน้ายัง fetch ข้อมูลเองเหมือนเดิม NAV_GROUPS เป็น static config

## Error Handling

ไม่มี error state ใหม่ — Tabs/PageTabs เป็น presentational + routing ล้วน กรณี pathname ไม่ตรงกลุ่มใด = ไม่แสดงแถบแท็บ (ไม่ throw)

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน
2. admin: sidebar เห็น **8 เมนู** (จาก 17); กด "จัดการระบบ" → เข้า `/dashboard/rooms` เห็นแถบแท็บ [ห้อง|ผู้ใช้|ตั้งค่า] active=ห้อง; กดสลับแท็บ → URL เปลี่ยนเป็น route จริง, หน้าเปลี่ยน, แท็บ active ตาม; refresh ค้างแท็บถูก; ปุ่ม back ทำงาน
3. admin: กด "รายงานและข้อมูล" → เห็นแท็บ 6 อัน สลับได้ครบ
4. approver: เห็น "งานอนุมัติ" (3 แท็บ) + "รายงาน" standalone; ไม่เห็นกลุ่ม admin
5. user: เห็น 5 เมนูเท่าเดิม ไม่มีแถบแท็บโผล่
6. มือถือ: แถบแท็บเลื่อนแนวนอนได้, bottom-nav ยังทำงาน
7. bookmark route เดิม (เช่น `/dashboard/settings` ตรงๆ) ยังเข้าได้ + เห็นแถบแท็บกลุ่มถูกต้อง (backward-compat)
8. ไม่มี regression ในหน้าเพจ 12 หน้า (ไม่ถูกแตะ)
