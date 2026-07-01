# Foundation Phase — โมดูลกลาง + Layout + Middleware

## บริบท

หลังจากระบบ password-login ทดสอบใช้งานได้แล้ว ขั้นตอนถัดไปคือเริ่มพัฒนาฟีเจอร์ธุรกิจจริง (จองห้อง, อนุมัติ, ยกเลิก, จัดการ Admin) โดยแบ่งงานเป็น 4 track ที่ทำขนานกันได้ในแต่ละ git worktree แยกกัน

แต่ก่อนแยก track ต้องมี "Foundation phase" ที่ทุก track ต้องพึ่งพาร่วมกันให้เสร็จก่อน ไม่งั้นแต่ละ track จะต่างคนต่างเขียนของซ้ำกัน (error handling, layout, navigation, route protection) ทำให้ขัดแย้งกันตอน merge

Foundation phase มี 2 ส่วน:
- **F1** — โมดูลกลางสำหรับ Edge Functions (`supabase/functions/_shared/`)
- **F2** — Design tokens, Layout/Navigation ที่ใช้ร่วมกัน, และ Middleware ที่รองรับ role-based route protection

ระหว่างสำรวจโค้ดพบ 2 จุดที่ต้องแก้ไขนอกเหนือจากแผนเดิม:
1. `docs/PRODUCT.md`/CLAUDE.md กฎข้อ 5 บังคับ `logIntegration()` ทุกครั้งที่เรียก external service — ต้องมีโมดูลกลางสำหรับสิ่งนี้ด้วย ไม่ใช่แค่ errors/handler/retry
2. `docs/DESIGN.md` section 7 เขียนตัวอย่างสำหรับ Tailwind v3 (`tailwind.config.ts`) แต่โปรเจกต์จริงใช้ Tailwind v4 (CSS-first ผ่าน `@theme` ใน `globals.css`) — ต้องเขียนวิธีเชื่อม token ใหม่ให้ตรงกับของจริง

## ขอบเขต (Scope)

**อยู่ในขอบเขตนี้:** โมดูลกลาง 4 ไฟล์, การเชื่อม design token เข้ากับ Tailwind v4, layout/navigation ร่วมสำหรับหน้าที่ login แล้ว, การขยาย middleware ให้เช็ค role

**ไม่อยู่ในขอบเขตนี้:** เนื้อหาจริงของ 4 track (จองห้อง, อนุมัติ, ยกเลิก, admin CRUD) — งานเหล่านั้นจะ brainstorm แยกเป็น spec ของตัวเองทีหลัง คนละรอบ

## F1 — โมดูลกลาง `supabase/functions/_shared/`

### `errors.ts`
คลาสฐาน `AppError extends Error` มี property `statusCode: number`, `code: string`
คลาสย่อย:
- `ValidationError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409) — เช่น กรณีจองห้องซ้อนเวลา

### `handler.ts`
`withErrorHandling(handler)` — ฟังก์ชันห่อ Edge Function handler:
- ถ้า handler throw `AppError` → คืน Response ด้วย `statusCode` ของ error นั้น พร้อม JSON `{ error: code, message }`
- ถ้า throw error อื่นที่ไม่ใช่ `AppError` → log error เต็มไว้ (server-side) แล้วคืน Response 500 ด้วยข้อความทั่วไป (ไม่หลุดรายละเอียดภายในระบบออกไปให้ client เห็น)

### `retry.ts`
`withRetry(fn, options)` — retry แบบ exponential backoff สำหรับเรียก external service (LINE, Make.com, Google Calendar) — `options` กำหนดจำนวนครั้งสูงสุดและ delay เริ่มต้นได้

### `integrationLog.ts` (เพิ่มใหม่จากแผนเดิม)
`logIntegration({ service, status, payload, error_detail })` — เขียนแถวใหม่ลงตาราง `integration_health` ตาม schema ที่มีอยู่แล้ว (`service`, `status`, `payload`, `error_detail`)

ทั้ง 4 ไฟล์เป็น utility ทั่วไป ไม่ผูกกับ business logic เฉพาะของ track ใดเลย เพราะยังไม่มี track ไหนเขียน Edge Function จริง

## F2.1 — เชื่อม Design Tokens เข้ากับ Tailwind v4

แก้ `app/globals.css`:
- ย้ายเนื้อหา `:root { ... }` จาก `tokens/tokens.css` เข้ามา (สี, spacing, radius, font, shadow ทั้งหมด)
- เพิ่ม `@theme inline { ... }` แมป token แต่ละตัวเข้า namespace ที่ Tailwind v4 ใช้สร้าง utility class อัตโนมัติ (เช่น `--color-brand-primary` → `bg-brand-primary`, `text-brand-primary`) ตาม pattern เดียวกับที่ไฟล์เดิมทำกับ `--color-background`
- ลบการอ้างอิง Geist font tokens ออก

แก้ `app/layout.tsx`:
- เปลี่ยนฟอนต์จาก Geist เป็น Sarabun ผ่าน `next/font/google`
- เปลี่ยน `<html lang="en">` เป็น `lang="th"`

## F2.2 — Layout/Navigation ร่วมสำหรับหน้าที่ Login แล้ว

สร้าง route group ใหม่ `app/(app)/` (ไม่กระทบ URL จริง แค่จัดกลุ่มไฟล์ให้ใช้ layout เดียวกัน):

`app/(app)/layout.tsx` — มี Navigation ร่วม:
- จอกว้าง ≥768px (breakpoint ตาม DESIGN.md section 5) → Sidebar ซ้ายมือ
- จอแคบ <768px → Bottom Navigation Bar
- รายการเมนูที่โชว์ปรับตาม role ของผู้ใช้ (query จาก `public.users.role`) ตามรายชื่อหน้าใน PRODUCT.md (user เห็น 6 หน้า, approver เห็นเพิ่ม 4, admin เห็นเพิ่มอีก 8)

การย้ายไฟล์:
- ย้าย `app/home/page.tsx` (ของเดิมจาก Task 5 ของ feature password-login) เข้าไปเป็น `app/(app)/home/page.tsx` — URL ยังคงเป็น `/home` เหมือนเดิม
- แก้ `app/page.tsx` (หน้า root `/` ที่ยังเป็น boilerplate ของ `create-next-app`) ให้ redirect ไป `/home` แทน

`/login` ยังอยู่นอกกลุ่มนี้เหมือนเดิม ไม่มี Navigation ร่วม

## F2.3 — ขยาย Middleware ให้รองรับ Role-based Route Protection

แก้ `lib/supabase/middleware.ts`:

เดิมมีแค่ `PROTECTED_PATHS = ["/home"]` เช็คว่ามี session หรือไม่ ใหม่จะเพิ่ม map ที่กำหนดว่าแต่ละ route ต้องการ role อะไรบ้าง:

```
ROUTE_ROLES = {
  "/setup":     ["admin"],
  "/dashboard": ["admin"],
  "/approver":  ["approver", "admin"],
  "/home":      ["user", "approver", "admin"],
  "/booking":   ["user", "approver", "admin"],
  "/calendar":  ["user", "approver", "admin"],
  "/profile":   ["user", "approver", "admin"],
}
```

Logic:
1. ไม่มี session เลย → redirect ไป `/login` (เหมือนเดิม)
2. มี session แต่ role (query จาก `public.users.role`) ไม่ตรงกับที่ route นั้นต้องการ → redirect ไป `/home`
3. Role ตรง → ผ่านตามปกติ

การจับคู่ path ใช้ `startsWith` เหมือน `PROTECTED_PATHS` เดิม (เช่น `/dashboard/rooms` จับคู่กับ key `/dashboard`) — ไม่ต้อง exact match

**ข้อควรทราบ:** นี่เป็นชั้น UX เท่านั้น (กันสับสน/กันเห็นหน้าที่ error ทันที) ไม่ใช่ชั้นความปลอดภัยจริง — ความปลอดภัยจริงอยู่ที่ RLS policies และ Edge Functions ที่ใช้ service_role ตามที่ CLAUDE.md ออกแบบไว้แล้ว เป้าหมายของส่วนนี้คือกันไม่ให้แต่ละ track (โดยเฉพาะ Track D — admin CRUD) ต้องเขียน role-check ซ้ำเองในทุกหน้า

## File Structure สรุป

| ไฟล์ | สถานะ |
|---|---|
| `supabase/functions/_shared/errors.ts` | สร้างใหม่ |
| `supabase/functions/_shared/handler.ts` | สร้างใหม่ |
| `supabase/functions/_shared/retry.ts` | สร้างใหม่ |
| `supabase/functions/_shared/integrationLog.ts` | สร้างใหม่ |
| `app/globals.css` | แก้ไข (เชื่อม token) |
| `app/layout.tsx` | แก้ไข (font + lang) |
| `app/(app)/layout.tsx` | สร้างใหม่ (Navigation ร่วม) |
| `app/(app)/home/page.tsx` | ย้ายจาก `app/home/page.tsx` |
| `app/page.tsx` | แก้ไข (redirect ไป `/home`) |
| `lib/supabase/middleware.ts` | แก้ไข (เพิ่ม role check) |

## การทดสอบ (Success Criteria)

1. `npx tsc --noEmit` และ `npm run build` ผ่านหลังแก้ทุกไฟล์
2. เปิด `/home` หลัง login ด้วยแต่ละ 4 test account → เห็น Navigation ที่ถูกต้องตาม role (เช่น user ไม่เห็นเมนู Dashboard)
3. Login ด้วย `user@test.local` แล้วพยายามเข้า `/dashboard` ตรงๆ → ถูก redirect กลับ `/home`
4. Login ด้วย `admin@test.local` แล้วเข้า `/dashboard` → เข้าได้ปกติ (แม้หน้ายังไม่มีเนื้อหาจริง จะได้ 404 จาก Next.js ไม่ใช่ redirect จาก middleware)
5. ตรวจสีปุ่ม/การ์ด/ฟอนต์บนหน้า `/login` และ `/home` ตรงกับ token ใน `docs/DESIGN.md` (เช่น `bg-brand-primary` เรนเดอร์เป็นสี `#15727d` จริง)
6. ปรับขนาดหน้าจอต่ำกว่า 768px → เห็น Bottom Navigation แทน Sidebar
