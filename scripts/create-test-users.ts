import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "ขาด NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_USERS = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    email: "user@test.local",
    full_name: "ทดสอบ ผู้ใช้งาน",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    email: "admin@test.local",
    full_name: "ทดสอบ ผู้ดูแลระบบ",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    email: "approver1@test.local",
    full_name: "ทดสอบ ผู้อนุมัติ 1",
  },
  {
    id: "44444444-4444-4444-4444-444444444444",
    email: "approver2@test.local",
    full_name: "ทดสอบ ผู้อนุมัติ 2",
  },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const testUser of TEST_USERS) {
    const { error } = await supabase.auth.admin.createUser({
      id: testUser.id,
      email: testUser.email,
      password: "test1234",
      email_confirm: true,
      user_metadata: { full_name: testUser.full_name },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already been registered")) {
        console.log(`ข้าม (มีอยู่แล้ว): ${testUser.email}`);
        skipped++;
        continue;
      }
      console.error(`สร้างไม่สำเร็จ ${testUser.email}:`, error.message);
      continue;
    }

    console.log(`สร้างสำเร็จ: ${testUser.email}`);
    created++;
  }

  console.log(`\nสรุป: สร้างใหม่ ${created} บัญชี, ข้าม ${skipped} บัญชี (มีอยู่แล้ว)`);
}

main();
