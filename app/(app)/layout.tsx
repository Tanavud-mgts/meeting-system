import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppNav from "./AppNav";
import PageTabs from "@/components/ui/PageTabs";
import NotificationBell from "@/components/ui/NotificationBell";
import { buildSidebar, type Role } from "@/lib/nav";

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

  const role = (profile?.role ?? "user") as Role;
  const sidebarItems = buildSidebar(role);

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <NotificationBell />
      <AppNav items={sidebarItems} />
      <main className="bg-page-wash flex-1 pt-14 pb-20 md:pt-0 md:pb-0">
        <PageTabs role={role} />
        {children}
      </main>
    </div>
  );
}
