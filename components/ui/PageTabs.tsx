"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { findGroupForPath, type Role } from "@/lib/nav";

export default function PageTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const group = findGroupForPath(pathname, role);

  if (!group) return null;

  const tabs = group.tabs
    .filter((t) => t.roles.includes(role))
    .map(({ href, label }) => ({ href, label }));

  if (tabs.length < 2) return null;

  return <Tabs tabs={tabs} />;
}
