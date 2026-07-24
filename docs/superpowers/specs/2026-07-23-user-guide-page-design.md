# หน้าคู่มือการใช้งานระบบ (`/guide`) — Design Spec

วันที่: 2026-07-23
สถานะ: อนุมัติแล้ว (รอ review spec)

## 1. เป้าหมาย

สร้างหน้าคู่มือการใช้งานที่อธิบายขั้นตอนการทำงานของระบบจองห้องประชุม LPRU
แสดง Workflows ให้เข้าใจง่าย โดยเนื้อหา **แสดงสะสมตามสิทธิ์ (cumulative)** ของผู้ใช้ที่ล็อกอิน:

- `user` → เห็นโมดูล **User**
- `approver` → เห็นโมดูล **User + Approver**
- `admin` → เห็นทั้งสามโมดูล **User + Approver + Admin**

หน้านี้เป็นเอกสารอ่านอย่างเดียว (read-only) — ไม่แตะ business logic หรือ database
เนื้อหาอ้างอิงจาก `docs/PRODUCT.md`

## 2. Route & Access

- Route ใหม่: `app/(app)/guide/page.tsx` — client component อ่าน role จาก Supabase (`users.role`) เหมือน `/home`
- เพิ่มลิงก์ **"คู่มือการใช้งาน"** ใน `lib/nav.ts` → `SIDEBAR_ORDER` โดยตั้ง `roles: ALL`
  วางตำแหน่งก่อน `/profile` (ท้ายเมนู)
- ไม่ต้องเพิ่ม NavGroup/PageTabs ใหม่ — เป็น standalone link

## 3. การแสดงเนื้อหาตามสิทธิ์

โมดูลเนื้อหา 3 ชุด:

| โมดูล | เนื้อหาหลัก |
|---|---|
| **User** | จองห้องประชุม, ดูปฏิทินภาพรวม, ดู/ยกเลิกการจอง (pending ยกเลิกทันที / approved ต้องขอยกเลิก), เชื่อม LINE ด้วย OTP |
| **Approver** | อนุมัติ/ปฏิเสธคำขอในขั้นของตน, พิจารณาคำขอยกเลิกจาก User, ดูรายงาน, ดูประวัติการทำงานของตัวเอง |
| **Admin** | จัดการห้องประชุม (CRUD), จัดการผู้ใช้/role/หน่วยงาน, ตั้งค่า Approval Chain & เวลาทำการ & วันหยุด, ยกเลิกการจองใดๆ ได้ทันที, Export & retention, Integration Health, ประวัติรวมทุกคน |

**Segmented control (client-side state, ไม่ใช่ URL):**
- ผู้ใช้ที่เข้าถึงได้มากกว่า 1 โมดูล (approver, admin) จะเห็น segmented control ด้านบนให้สลับดู
  ตัวเลือก: `[ทั้งหมด] [User] [Approver] [Admin]` — แสดงเฉพาะ segment ที่ role นั้นเข้าถึงได้
- ค่าเริ่มต้น = "ทั้งหมด"
- ผู้ใช้ role `user` (เข้าถึงโมดูลเดียว) → ไม่แสดง segmented control เลย แสดงโมดูล User ตรงๆ
- state เก็บใน `useState` เท่านั้น ไม่ผูก URL / query param

## 4. รูปแบบ UI (ผสม card + diagram)

ใช้ design token จาก `docs/DESIGN.md` เท่านั้น — ห้าม hardcode สี/spacing/font (CLAUDE.md rule #10)
ข้อความ UI ภาษาไทยทางการ

โครงหน้า:

1. **PageHero** (`components/ui/PageHero`) — หัว gradient
   - title: "คู่มือการใช้งานระบบ"
   - subtitle: อธิบายสั้นๆ ว่าคู่มือปรับตามสิทธิ์ผู้ใช้
2. **Segmented control** (ถ้ามีหลายโมดูล) — วางในแถบใต้ hero
3. แต่ละโมดูล render เป็นชุดของ:
   - **EditorialCard** + `SectionTitle` ต่อ 1 workflow
   - ภายในการ์ด: **step cards** เรียงลำดับ — แต่ละ step มี
     - หมายเลขลำดับ (badge วงกลม/สี่เหลี่ยม token)
     - หัวข้อ step
     - คำอธิบาย
     - **ลิงก์ "ไปหน้าจริง"** (ปุ่ม/ลิงก์) ไปยัง route ที่เกี่ยวข้อง เช่น step "จองห้อง" → `/booking`
       (step ที่ไม่มีหน้าตรงๆ เช่นขั้นตอนเชิงอธิบาย จะไม่มีลิงก์ — field เป็น optional)
4. **Approval Chain diagram** (`components/guide/ApprovalChainDiagram.tsx`)
   - responsive flex/SVG แสดง: `ผู้จอง → Admin → Approver 1 → Approver 2 → ✅ อนุมัติ`
   - แสดง branch "ปฏิเสธที่ step ใดก็ตาม → จบ chain ทันที (rejected)"
   - แสดงในโมดูล User (อธิบายเส้นทางคำขอของตน) และเน้นในโมดูล Approver
5. **ตารางสถานะการจอง** (`components/guide/StatusLegend.tsx`)
   - ครบทุกสถานะจาก PRODUCT.md §3: `pending`, `approved`, `rejected`, `cancelled`, `cancel_requested`, `cancelled_by_admin`
   - ใช้ `StatusMarker` (`components/ui/StatusMarker`) กำหนด tone สีให้เหมาะ + คำอธิบายความหมาย

## 5. โครงสร้างไฟล์

```
app/(app)/guide/page.tsx                     โหลด role, จัดการ segmented control, render โมดูลตามสิทธิ์
lib/guide/content.ts                         ข้อมูลคู่มือทั้งหมด (data-driven) แยก content ออกจาก render
components/guide/WorkflowSteps.tsx            render step cards จาก data (รวมลิงก์ไปหน้าจริง)
components/guide/ApprovalChainDiagram.tsx     diagram approval chain (reusable)
components/guide/StatusLegend.tsx             ตารางสถานะการจอง
lib/nav.ts                                    +1 บรรทัด ลิงก์ /guide (roles: ALL)
```

### โครงข้อมูล `lib/guide/content.ts`

```ts
export type GuideModule = "user" | "approver" | "admin";

export type GuideStep = {
  title: string;
  description: string;
  href?: string;       // ลิงก์ไปหน้าจริง (optional)
  linkLabel?: string;  // ข้อความปุ่ม เช่น "ไปหน้าจองห้อง"
};

export type GuideSection = {
  id: string;
  title: string;              // ใช้กับ SectionTitle
  steps: GuideStep[];
};

export type GuideModuleContent = {
  module: GuideModule;
  label: string;              // "ผู้ใช้ทั่วไป" / "ผู้อนุมัติ" / "ผู้ดูแลระบบ"
  sections: GuideSection[];
};

export const GUIDE_CONTENT: GuideModuleContent[] = [ /* ... */ ];
```

การมองเห็นตาม role คำนวณจากลำดับสิทธิ์:
`user` เห็น `["user"]` · `approver` เห็น `["user","approver"]` · `admin` เห็น `["user","approver","admin"]`

## 6. Data flow

1. `page.tsx` mount → `supabase.auth.getUser()` → query `users.role`
2. คำนวณรายชื่อโมดูลที่เข้าถึงได้จาก role
3. render segmented control (ถ้า > 1 โมดูล) + เนื้อหาที่ filter ตาม segment ที่เลือก
4. ไม่มีการเขียนข้อมูล ไม่เรียก external service — ไม่ต้อง `logIntegration()`

## 7. Error / Loading states

- Loading: ใช้ `Skeleton` (`components/ui/Skeleton`) เหมือน `/home`
- ถ้าโหลด user/role ไม่ได้: แสดงข้อความ error ภาษาไทย (`text-danger-text`) เหมือน pattern ใน `/home`
- ถ้า role ไม่รู้จัก → fallback เป็น `user` (แสดงโมดูล User)

## 8. Testing

- **Unit (Vitest):** ฟังก์ชันคำนวณโมดูลที่เข้าถึงได้จาก role (`user`/`approver`/`admin` → รายชื่อโมดูลถูกต้อง; role ไม่รู้จัก → `["user"]`)
- **Component/integration:** render `WorkflowSteps` จาก data — step ที่มี `href` แสดงลิงก์, step ที่ไม่มี `href` ไม่แสดงลิงก์
- **E2E (Playwright, optional):** login เป็น user/approver/admin แล้วตรวจว่าเห็นโมดูลถูกต้องตามสิทธิ์ (user ไม่เห็น segmented control; admin เห็นครบ 3)

## 9. Out of scope (YAGNI)

- ไม่มีระบบค้นหาภายในคู่มือ
- ไม่มี deep-link ไป segment เฉพาะผ่าน URL (state เป็น in-memory เท่านั้น)
- ไม่มีการแก้ไขเนื้อหาคู่มือผ่าน UI (เนื้อหาเป็น static data ในโค้ด)
- ไม่มี i18n — ภาษาไทยอย่างเดียว
```
