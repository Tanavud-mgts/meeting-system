import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-red-600">
          ไม่พบข้อมูลผู้ใช้งาน กรุณาลองเข้าสู่ระบบใหม่
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">
          ยินดีต้อนรับ {profile.full_name}
        </h1>
        <p className="mt-2 text-zinc-600">
          {profile.email} — บทบาท: {profile.role}
        </p>
      </div>
    </div>
  );
}
