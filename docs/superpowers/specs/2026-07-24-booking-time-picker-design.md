# Booking Time Picker — ป้องกันเวลานอกเวลาทำการ

**วันที่:** 2026-07-24
**สถานะ:** อนุมัติ design แล้ว รอเขียน implementation plan

## ปัญหา

หน้าจองห้อง ([app/(app)/booking/page.tsx](../../../app/(app)/booking/page.tsx)) ให้ผู้ใช้เลือกเวลาเริ่ม/จบด้วย `<input type="time" min max>` แต่ attribute `min`/`max` ของ input ชนิดนี้**ไม่บล็อกการกรอกค่าเกินขอบเขต** — เบราว์เซอร์แค่ทำเครื่องหมาย invalid เงียบๆ และหน้านี้ไม่ได้ตรวจค่าใน `handleSearch()` เลย ผู้ใช้จึงค้นหาและเลือกห้องด้วยเวลา เช่น 16:20–20:16 ได้ ทั้งที่เวลาทำการคือ 08:00–17:00 ระบบไปตายที่ trigger ตอน "ยืนยันการจอง" ขั้นสุดท้าย (UX แย่)

นอกจากนี้ trigger `validate_booking_hours` ([supabase/migrations/011_triggers_business_logic.sql:57](../../../supabase/migrations/011_triggers_business_logic.sql)) มีบั๊ก:
- เทียบเฉพาะ **ชั่วโมง** ด้วย `EXTRACT(HOUR ...)` → จองจบ 17:59 ผ่านได้ทั้งที่ปิด 17:00
- ไม่เช็ค `end_time > start_time`
- ไม่กันกรณีจองข้ามวัน

## เป้าหมาย

1. ทำให้ผู้ใช้ **เลือกเวลานอกเวลาทำการไม่ได้เชิงโครงสร้าง** ที่หน้าเว็บ
2. ทำให้ trigger ฐานข้อมูลเป็นด่านสุดท้ายที่ถูกต้องแม่นยำ (กันครบทุกทางเข้า: เว็บ / LINE / API)

ไม่รวมในงานนี้: พักเที่ยง (config ไม่มี field และไม่ต้องการ — จองคร่อมเที่ยงได้ตามเดิม)

## แนวทาง (อนุมัติแล้ว: A + แก้ trigger)

### ส่วนที่ 1 — Frontend: เปลี่ยนช่องเวลาเป็น dropdown 30 นาที

ไฟล์: [app/(app)/booking/page.tsx](../../../app/(app)/booking/page.tsx)

แทน `<input type="time">` สองช่อง (เวลาเริ่ม / เวลาจบ) ด้วย `<select>` สองช่อง

**ตัวช่วยสร้างรายการเวลา** — ฟังก์ชัน pure สร้าง array ของ string `"HH:MM"` ทีละ 30 นาที ตั้งแต่ `office_start_hour:00` ถึง `office_end_hour:00` (รวมปลายทั้งสอง)
- ตัวอย่าง office 8–17 → `["08:00","08:30", ... ,"16:30","17:00"]` (19 ค่า)
- คำนวณจาก config เท่านั้น ห้าม hardcode 8–17 (Critical Rule #4)

**ช่องเวลาเริ่ม (`<select>`)**
- ตัวเลือก = รายการเวลาทั้งหมด **ยกเว้นค่าสุดท้าย** (เริ่มที่ 17:00 ไม่ได้ เพราะไม่มีช่วงเวลาให้ประชุม) → ค่าสุดท้ายที่เลือกได้คือ 16:30
- มี option ว่าง (placeholder) เป็นค่าเริ่มต้น

**ช่องเวลาจบ (`<select>`)**
- ตัวเลือก = รายการเวลาที่ **มากกว่าเวลาเริ่มที่เลือก** และไม่เกิน `office_end_hour:00`
- ถ้ายังไม่เลือกเวลาเริ่ม → select นี้ disabled
- มี option ว่าง (placeholder)

**พฤติกรรมเชื่อมกัน**
- เมื่อเปลี่ยนเวลาเริ่ม แล้วเวลาจบเดิมกลายเป็น invalid (≤ เวลาเริ่มใหม่) → รีเซ็ต `endTime` เป็นค่าว่าง
- ระหว่าง config ยังโหลดไม่เสร็จ หรือโหลดล้มเหลว (`config === null`) → select ทั้งสอง disabled; ข้อความเตือน `configError` เดิมยังทำงานตามปกติ

**คงเดิม**
- state `startTime` / `endTime` ยังเป็น string `"HH:MM"` เหมือนเดิม → `handleSearch()` และ `handleSubmit()` ที่ประกอบ ISO string (`${date}T${startTime}:00+07:00`) ไม่ต้องแก้
- ปุ่มค้นหา disabled เมื่อ `!startTime || !endTime` เดิมยังคุมได้
- ลบ `minTime` / `maxTime` ที่ไม่ใช้แล้วออก

**ผลลัพธ์:** ค่านอกเวลาทำการเลือกไม่ได้เลย และปัญหา end ≤ start หายไปในตัว (ช่องจบไม่แสดงค่าที่ ≤ เริ่ม)

### ส่วนที่ 2 — Database: แก้ trigger

ไฟล์ใหม่: `supabase/migrations/015_fix_validate_booking_hours.sql` (รันผ่าน `apply_migration` MCP tool)

`CREATE OR REPLACE FUNCTION validate_booking_hours()` — ไม่ DROP อะไร (Critical Rule #8) trigger `trg_validate_hours` เดิมชี้ที่ฟังก์ชันนี้อยู่แล้วจึงใช้ตัวใหม่อัตโนมัติ

Logic ใหม่:
1. อ่าน `office_start_hour, office_end_hour, holidays` จาก `system_config` (คงเดิม)
2. ถ้าไม่มี `system_config` → `RETURN NEW` (คง fallback ช่วง setup เดิม)
3. เช็ควันหยุด (คงเดิม)
4. คำนวณเวลาท้องถิ่น: `start_local := NEW.start_time AT TIME ZONE 'Asia/Bangkok'`, `end_local := NEW.end_time AT TIME ZONE 'Asia/Bangkok'`
5. **ใหม่:** ถ้า `NEW.end_time <= NEW.start_time` → RAISE (`เวลาจบต้องมากกว่าเวลาเริ่ม`)
6. **ใหม่:** ถ้า `start_local::date <> end_local::date` → RAISE (กันจองข้ามวัน — อยู่นอกเวลาทำการ)
7. **แก้:** เทียบเวลาเต็มรวมนาที:
   - `start_local::time < make_time(office_start_hour, 0, 0)` **หรือ**
   - `end_local::time > make_time(office_end_hour, 0, 0)`
   - → RAISE `อยู่นอกเวลาทำการ (HH:00 - HH:00 น.)` (คงข้อความรูปแบบเดิม)
8. ทุก RAISE ใช้ `ERRCODE = 'P0001'` (คงเดิม เพื่อให้ error handler เดิมจับได้)

หมายเหตุ: จบเวลา 17:00 พอดีต้องผ่าน (`'17:00'::time <= make_time(17,0,0)` เป็นจริง) — ยืนยันด้วย test

## การทดสอบ

**Frontend (Vitest / Playwright ตามที่มีอยู่)**
- ตัวช่วยสร้างเวลา: office 8–17 คืน 19 ค่า, ค่าแรก `08:00`, ค่าสุดท้าย `17:00`
- ช่องเริ่มไม่มี option `17:00`
- เลือกเริ่ม 16:30 → ช่องจบมีเฉพาะ `17:00`
- เปลี่ยนเริ่มเป็นค่าที่สูงกว่าเวลาจบเดิม → เวลาจบถูกรีเซ็ต
- config = null → select disabled

**Database (SQL / integration)**
- จอง 08:00–17:00 → ผ่าน
- จอง 16:20–20:16 → RAISE นอกเวลาทำการ (เคสจากบั๊กจริง)
- จอง 08:00–17:30 → RAISE (เดิมบั๊กนี้ผ่านเพราะเทียบแค่ชั่วโมง = 17)
- จอง end ≤ start → RAISE
- จองข้ามวัน → RAISE

## ผลกระทบ / ความเสี่ยง

- ไม่กระทบ schema, ไม่กระทบ API contract ของ `create-booking` (ยังรับ ISO เดิม)
- migration เป็น idempotent `CREATE OR REPLACE` — รันซ้ำปลอดภัย
- ถ้ามี booking เดิมในฐานข้อมูลที่ละเมิดกฎใหม่ ไม่กระทบ (trigger ทำงานเฉพาะ INSERT ใหม่)
