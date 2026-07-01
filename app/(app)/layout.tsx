import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type NavItem = { href: string; label: string };

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  user: [
    { href: "/home", label: "หน้าหลัก" },
    { href: "/booking", label: "จองห้อง" },
    { href: "/calendar", label: "ปฏิทิน" },
    { href: "/profile/bookings", label: "การจองของฉัน" },
    { href: "/profile", label: "โปรไฟล์" },
  ],
  approver: [
    { href: "/approver", label: "คำขออนุมัติ" },
    { href: "/approver/cancel-requests", label: "คำขอยกเลิก" },
    { href: "/approver/history", label: "ประวัติการทำงาน" },
    { href: "/dashboard/reports", label: "รายงาน" },
  ],
  admin: [
    { href: "/dashboard", label: "ภาพรวมระบบ" },
    { href: "/dashboard/rooms", label: "จัดการห้อง" },
    { href: "/dashboard/users", label: "จัดการผู้ใช้" },
    { href: "/dashboard/bookings", label: "การจองทั้งหมด" },
    { href: "/dashboard/settings", label: "ตั้งค่า" },
    { href: "/dashboard/data", label: "ข้อมูล/Export" },
    { href: "/dashboard/integrations", label: "Integration Health" },
    { href: "/dashboard/activity", label: "ประวัติรวม" },
  ],
};

function navForRole(role: string): NavItem[] {
  const items = [...NAV_BY_ROLE.user];
  if (role === "approver" || role === "admin") {
    items.push(...NAV_BY_ROLE.approver);
  }
  if (role === "admin") {
    items.push(...NAV_BY_ROLE.admin);
  }
  return items;
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "user";
  const navItems = navForRole(role);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="hidden w-[200px] shrink-0 border-r border-neutral-200 bg-surface-card p-4 md:block">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-sm px-3 py-2 text-sm text-text-secondary hover:bg-neutral-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 bg-surface-page">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 flex h-16 items-center justify-around border-t border-neutral-200 bg-surface-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {navItems.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-xs text-text-secondary"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
