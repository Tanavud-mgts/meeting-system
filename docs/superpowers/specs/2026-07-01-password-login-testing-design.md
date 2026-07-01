# Password Login สำหรับทดสอบระบบ (ก่อนมี Google OAuth)

## บริบท

ระบบ LPRU ยังอยู่ในสถานะ boilerplate ของ `create-next-app` ยังไม่มี Supabase client, middleware, หรือหน้า login ใดๆ CLAUDE.md ล็อกสถาปัตยกรรม auth ไว้ที่ Google OAuth จำกัดเฉพาะ `@g.lpru.ac.th` แต่การสร้าง flow นั้นเต็มรูปแบบ (Google Console, Auth Hook, domain-check middleware) ใช้เวลา และทีมต้องการทดสอบ business logic (booking, approval chain, cancellation) ก่อนที่ Google OAuth จะพร้อม

`supabase/migrations/014_seed_data.sql` มี test users (`user@test.local`, `admin@test.local`, `approver1@test.local`, `approver2@test.local` / `test1234`) แต่สร้างผ่าน raw SQL `INSERT INTO auth.users` ซึ่งไฟล์เขียนกำกับไว้เองว่า "ใช้เฉพาะ Local Development (Docker) เท่านั้น ห้ามรันใน production" โปรเจกต์นี้ไม่ใช้ Docker local (ใช้ Supabase Cloud ตรงตาม CLAUDE.md) วิธีเดิมจึงใช้ไม่ได้ ต้องหาวิธีสร้าง test users ที่ทำงานกับ Supabase Cloud ได้จริง

## เป้าหมาย

เปิดทางให้ทดสอบระบบด้วย email/password login (ไม่รอ Google OAuth) โดยที่:
1. ปิดสวิตช์ได้ง่ายและปลอดภัยตอนพร้อมขึ้น production (ไม่มีทางหลุดไปโดยไม่ตั้งใจ)
2. ไม่ทำให้งาน Google OAuth ในอนาคตซับซ้อนขึ้น (เป็นคนละ path กัน)
3. Test accounts สร้างซ้ำได้ (reproducible) ไม่ต้องพึ่งการกดมือใน Dashboard ทุกครั้ง

## ขอบเขต (Scope)

**อยู่ในขอบเขตนี้:**
- Supabase client helpers (`lib/supabase/client.ts`, `lib/supabase/server.ts`) — พื้นฐานที่ทุก auth flow ต้องใช้ ไม่ว่าจะเป็น password หรือ Google OAuth ภายหลัง
- `middleware.ts` — เวอร์ชันเริ่มต้น: รีเฟรช Supabase session cookie ทุก request + redirect ไป `/login` ถ้ายังไม่ login เมื่อเข้าหน้าที่ต้อง auth (ตอนนี้มีแค่ `/home`)
- `app/login/page.tsx` — ฟอร์ม email/password (แสดงเฉพาะเมื่อ `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === 'true'`)
- `app/home/page.tsx` — หน้า stub แสดงชื่อ/email/role ของผู้ login เพื่อพิสูจน์ flow ทำงานจบ
- `scripts/create-test-users.ts` — script รันครั้งเดียวสร้าง 4 test accounts ผ่าน Supabase Admin API
- แก้ `supabase/migrations/014_seed_data.sql` — ลบ block `INSERT INTO auth.users` ออก (ใช้ไม่ได้กับ Cloud) อัปเดต comment

**ไม่อยู่ในขอบเขตนี้ (เป็นงานอนาคต แยกทำ):**
- Google OAuth flow, Auth Hook Edge Function, domain-check logic ใน middleware
- หน้าอื่นๆ ตาม PRODUCT.md (`/booking`, `/calendar`, `/approver`, `/dashboard/*` ฯลฯ)
- Role-based route protection แบบเต็มรูปแบบ (ตอนนี้มีแค่ redirect ถ้าไม่ login เฉยๆ)

## สถาปัตยกรรม / Components

### 1. Supabase Client Helpers
ใช้ `@supabase/ssr` (ยังไม่มี dependency นี้ ต้องติดตั้งเพิ่ม):
- `lib/supabase/client.ts` — browser client สำหรับ client component (`app/login/page.tsx`)
- `lib/supabase/server.ts` — server client สำหรับ server component (`app/home/page.tsx`) อ่าน cookie ผ่าน Next.js `cookies()`

### 2. `middleware.ts`
- เรียก `supabase.auth.getUser()` ทุก request เพื่อรีเฟรช session cookie (ตาม pattern มาตรฐานของ `@supabase/ssr`)
- ถ้า path เป็น `/home` และไม่มี session → redirect ไป `/login`
- ยังไม่มี domain-check (`@g.lpru.ac.th`) เพราะเป็นส่วนของ Google OAuth ที่ยังไม่ได้ทำ — จะเพิ่มทีหลัง

### 3. `app/login/page.tsx` (client component)
- ถ้า `process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN !== 'true'` → แสดงข้อความ "ปิดใช้งานการเข้าสู่ระบบด้วยรหัสผ่านชั่วคราว" แทนฟอร์ม ไม่ render input ใดๆ
- ถ้าเปิดอยู่ → ฟอร์ม email + password → เรียก `supabase.auth.signInWithPassword({ email, password })` → สำเร็จ redirect ไป `/home` → ล้มเหลว แสดงข้อความภาษาไทยกลางๆ "อีเมลหรือรหัสผ่านไม่ถูกต้อง" (ไม่บอกว่าผิดจุดไหน กัน user enumeration)

### 4. `app/home/page.tsx` (server component)
- ดึง session ผ่าน `lib/supabase/server.ts` ถ้าไม่มี → redirect `/login` (สำรองจาก middleware อีกชั้น)
- Query `public.users` ด้วย `auth.uid()` ปัจจุบัน แสดง `full_name`, `email`, `role` เป็นภาษาไทย

### 5. `scripts/create-test-users.ts`
- Node script (รันด้วย `npx tsx scripts/create-test-users.ts`) ใช้ `@supabase/supabase-js` สร้าง Admin client ด้วย `SUPABASE_SERVICE_ROLE_KEY` (จาก `.env.local` เท่านั้น — ห้ามใช้ prefix `NEXT_PUBLIC_`)
- สร้าง/ตรวจสอบ 4 บัญชี ด้วย UUID ตายตัวเดิมที่ `014_seed_data.sql` ใช้อยู่แล้ว (`11111111-...`, `22222222-...`, `33333333-...`, `44444444-...`) ผ่าน `supabase.auth.admin.createUser({ ...,  email_confirm: true })` — idempotent (เช็คก่อนว่ามี user นี้แล้วหรือยัง ข้ามถ้ามี)
- Log ผลลัพธ์เป็นภาษาไทยว่าสร้างสำเร็จ/มีอยู่แล้วกี่บัญชี

### 6. แก้ `supabase/migrations/014_seed_data.sql`
- ลบ section "Auth Users (Supabase Auth layer)" ทั้งหมดออก (บรรทัด 8-49 ปัจจุบัน)
- อัปเดต comment หัวไฟล์: อธิบายว่าต้องรัน `scripts/create-test-users.ts` ก่อน แล้วค่อยรันไฟล์นี้ (ยังคงเตือนห้ามรันใน production จริงถ้าไม่ได้ตั้งใจทดสอบ)
- ส่วนที่เหลือ (public.users, system_config, rooms, bookings, approval_logs) ไม่แก้

## Dependencies ที่ต้องเพิ่ม

`package.json` ปัจจุบันยังไม่มี Supabase SDK ใดๆ เลย ต้องเพิ่ม:
- `@supabase/ssr` — client/server helpers ใน Next.js App Router
- `@supabase/supabase-js` — ใช้ใน `scripts/create-test-users.ts` (Admin API)
- `tsx` (devDependency) — รัน `.ts` script ตรงๆ ผ่าน `npx tsx`

## Environment Variables ที่ต้องเพิ่ม

| ตัวแปร | ใช้ที่ไหน | หมายเหตุ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | public |
| `SUPABASE_SERVICE_ROLE_KEY` | `scripts/create-test-users.ts` เท่านั้น | **ห้ามมี prefix `NEXT_PUBLIC_`** ห้ามอยู่ใน client code เด็ดขาด |
| `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` | `app/login/page.tsx` | `'true'` เพื่อเปิด, ไม่ตั้งค่า/false เพื่อปิด — **ต้องไม่ตั้งใน Vercel production** |

ทั้งหมดเก็บใน `.env.local` (ตรวจแล้วว่า `.env*` อยู่ใน `.gitignore` แล้ว ปลอดภัย)

## Data Flow

```
Dev รัน scripts/create-test-users.ts (ครั้งเดียว)
  → สร้าง 4 auth.users บน Supabase Cloud

Dev รัน 014_seed_data.sql (แก้แล้ว) ผ่าน Dashboard SQL Editor
  → สร้าง public.users + system_config + rooms + sample bookings

ผู้ทดสอบเข้า /login (NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true)
  → กรอก admin@test.local / test1234
  → supabase.auth.signInWithPassword() (client-side)
  → สำเร็จ → set session cookie → redirect /home

/home (server component)
  → อ่าน session ผ่าน middleware-refreshed cookie
  → query public.users ด้วย auth.uid()
  → แสดง "ยินดีต้อนรับ ทดสอบ ผู้ดูแลระบบ (admin)"
```

## Error Handling

| กรณี | พฤติกรรม |
|---|---|
| อีเมล/รหัสผ่านผิด | แสดง "อีเมลหรือรหัสผ่านไม่ถูกต้อง" (ข้อความเดียวกันทั้งสองกรณี) |
| `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` ไม่ใช่ `'true'` | ไม่ render ฟอร์ม แสดงข้อความสถานะแทน |
| เข้า `/home` โดยไม่มี session | middleware redirect ไป `/login` ก่อนถึงหน้า |
| Query `public.users` ไม่เจอแถว (แปลก แต่เผื่อไว้) | แสดงข้อความ error ทั่วไป ไม่ crash |

## การทดสอบ (Success Criteria)

1. รัน `scripts/create-test-users.ts` → เห็น log ว่าสร้างครบ 4 บัญชี (หรือ "มีอยู่แล้ว" ถ้ารันซ้ำ)
2. เปิด Supabase Dashboard → Authentication → Users → เห็น 4 อีเมล `@test.local`
3. รัน `014_seed_data.sql` เวอร์ชันแก้ไข้ → ไม่มี error, ตรวจ `SELECT * FROM public.users` เห็น 4 แถว
4. `npm run dev` พร้อม `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true` ใน `.env.local` → เข้า `/login` → login ด้วยแต่ละ 4 บัญชี → ไปถึง `/home` เห็นชื่อ/role ตรงกับที่ seed ไว้
5. ลองรหัสผ่านผิด → เห็นข้อความ error ภาษาไทย ไม่ crash
6. ตั้ง `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=false` (หรือลบออก) → เข้า `/login` → ไม่เห็นฟอร์ม เห็นข้อความ "ปิดใช้งานชั่วคราว" แทน
7. ลองเข้า `/home` ตรงๆ โดยไม่ login (เปิด incognito) → ถูก redirect ไป `/login`

## Checklist ก่อนขึ้น Production (ไม่ใช่โค้ด — เป็นขั้นตอนที่ต้องทำตอน deploy จริง)

- [ ] ไม่ตั้งค่า `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` ใน Vercel Environment Variables (หรือตั้งเป็น `false`)
- [ ] ปิด "Email" provider ใน Supabase Dashboard → Authentication → Providers (defense-in-depth เผื่อมีคนเรียก Supabase Auth API ตรงข้าม UI)
- [ ] เมื่อ Google OAuth พร้อมใช้งานจริง ให้พิจารณาลบโค้ด password login ออกทั้งหมด (ไม่ใช่แค่ปิด env var) เพื่อลด attack surface ระยะยาว — เป็นงานแยกต่างหาก ไม่ได้อยู่ใน scope นี้
