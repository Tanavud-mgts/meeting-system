# Track D (sub-project 4) — ภาพรวมระบบ (`/dashboard`)

## บริบท

ต่อจาก Track D sub-project 1-3 (rooms/users/settings, bookings list+direct-cancel, activity log — เสร็จแล้วในเวิร์กทรีเดียวกัน) — sub-project นี้สร้างหน้า `/dashboard` เป็น landing page ของ Admin แสดงสถิติสรุปภาพรวมระบบตาม `docs/PRODUCT.md` ("Admin: /dashboard — ภาพรวมระบบ")

หน้านี้เป็น **read-only ทั้งหมด** เหมือน `/dashboard/activity` — ไม่มี view สรุปสำเร็จรูปในฐานข้อมูลสำหรับหน้านี้ จึงยิง count query แยกตามเงื่อนไขแบบขนาน ไม่มี Edge Function ในสโคปนี้

## ขอบเขต

**อยู่ในขอบเขตนี้:**
- หน้า `/dashboard` — สถิตินับ (booking/ห้อง/ผู้ใช้) + การ์ด highlight จำนวนรอดำเนินการ

**ไม่อยู่ในขอบเขตนี้ (เก็บไว้ให้ sub-project ถัดไปของ Track D):**
- `/dashboard/data` (Export/retention/danger zone), `/dashboard/integrations` (Integration Health), `/setup` (wizard)
- กราฟ/chart ใดๆ — ไม่เพิ่ม dependency ใหม่ ใช้ตัวเลขสถิติล้วนตาม YAGNI

## สถาปัตยกรรม / Components

### หน้า `/dashboard`

Query ตรงจาก client ด้วย count query แบบขนาน (`Promise.all` เดียว) — ไม่ดึงข้อมูลจริง ใช้ `.select("id", { count: "exact", head: true })` พร้อมเงื่อนไข `.eq()` ที่ต้องการนับเท่านั้น

**สถิตินับ (3 กลุ่ม แสดงเป็นการ์ดปกติด้วย token สี neutral/surface):**
- **Booking ตามสถานะ:** `pending`, `approved`, `cancel_requested`, `rejected`, "ยกเลิกแล้ว" (รวม `cancelled`+`cancelled_by_admin` เป็นตัวเลขเดียว — สอดคล้องกับ label ที่ใช้ทั่วทั้งระบบใน `/dashboard/bookings`/`/profile/bookings`)
- **ห้องตามสถานะ:** `available`, `busy`, `maintenance`
- **ผู้ใช้ตาม role:** `user`, `approver`, `admin`

**จำนวนรอดำเนินการ (การ์ด highlight สีเหลือง ด้วย token `warning-*` เหมือน urgent border ของ `/approver`, แสดงด้านบนสุดของหน้า):**
- "รอ Admin อนุมัติ" = `SELECT count(*) FROM bookings WHERE final_status='pending' AND current_step=0` (คิวของ Admin เองใน step 1 ของ Approval Chain) → คลิกไปหน้า `/approver`
- "รอพิจารณาคำขอยกเลิก" = `SELECT count(*) FROM bookings WHERE final_status='cancel_requested'` → คลิกไปหน้า `/approver/cancel-requests`

ทั้งสองการ์ด highlight ใช้ `next/link` ไปหน้าที่เกี่ยวข้องโดยตรง (ทั้งสองหน้ามีอยู่แล้วจาก Track B/C — แต่ยังไม่ merge เข้า worktree นี้ ดังนั้นลิงก์จะชี้ไปหน้าที่ยังไม่มีอยู่จริงในเวิร์กทรีนี้จนกว่าจะ merge — เป็นเรื่องปกติเหมือนที่ nav bar ของ Foundation phase มีลิงก์ไปหน้าที่ track อื่นสร้างอยู่แล้วเช่นกัน)

## Data Flow

```
Admin เปิด /dashboard
  → ยิง count query ทั้งหมดพร้อมกัน (Promise.all): 5 booking-status + 3 room-status + 3 role + 2 pending-action = 13 queries
  → แสดงการ์ด highlight สีเหลือง 2 การ์ดด้านบนสุด (ลิงก์ไป /approver, /approver/cancel-requests)
  → แสดงการ์ดสถิติ 3 กลุ่มด้านล่าง (booking/ห้อง/ผู้ใช้)
```

ไม่มีการเขียนข้อมูลในหน้านี้เลย (read-only ทั้งหมด) จึงไม่มี Edge Function ในสโคปนี้

## Error Handling สรุป

| กรณี | ข้อความ |
|---|---|
| โหลดสถิติไม่สำเร็จ (query ใดๆ ใน `Promise.all` ล้มเหลว) | "ไม่สามารถโหลดข้อมูลภาพรวมได้" |

## Testing (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่าน
2. Login `admin@test.local` เปิด `/dashboard` เห็นตัวเลขสถิติทั้ง 3 กลุ่มตรงกับ seed data จริง: booking (`pending`=1, `approved`=1, `rejected`=1, `cancel_requested`=1, "ยกเลิกแล้ว"=0), ห้อง (`available`=3, `maintenance`=1, `busy`=0), ผู้ใช้ (`user`=1, `approver`=2, `admin`=1)
3. การ์ด highlight แสดง "รอ Admin อนุมัติ" = 1 (Booking 1 ตรงเงื่อนไข `pending`+`current_step=0`) และ "รอพิจารณาคำขอยกเลิก" = 1 (Booking 4) ถูกต้อง
4. กดลิงก์จากการ์ด highlight ไปหน้า `/approver`/`/approver/cancel-requests` ได้ถูกต้อง (ตรวจแค่ URL ที่นำทางไป ไม่ต้องตรวจเนื้อหาหน้าปลายทางเพราะยังไม่มีอยู่ใน worktree นี้จนกว่าจะ merge Track B/C)
5. Login เป็น `user@test.local`/`approver1@test.local` พยายามเข้า `/dashboard` ตรงๆ ทาง URL → ถูก middleware บล็อก redirect ไป `/home` (ครอบคลุมด้วย prefix `/dashboard` → `["admin"]` ที่มีอยู่แล้ว ไม่ต้องแก้ middleware เพิ่ม)
