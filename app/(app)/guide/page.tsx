"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHero } from "@/components/ui/PageHero";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  GUIDE_CONTENT,
  modulesForRole,
  type GuideModule,
} from "@/lib/guide/content";
import { WorkflowSteps } from "@/components/guide/WorkflowSteps";
import { ApprovalChainDiagram } from "@/components/guide/ApprovalChainDiagram";
import { StatusLegend } from "@/components/guide/StatusLegend";

type Segment = "all" | GuideModule;

export default function GuidePage() {
  const [modules, setModules] = useState<GuideModule[] | null>(null);
  const [segment, setSegment] = useState<Segment>("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();
      setModules(modulesForRole(profile?.role ?? "user"));
    }
    load();
  }, []);

  const visibleModules = useMemo(() => {
    if (!modules) return [];
    return GUIDE_CONTENT.filter(
      (m) =>
        modules.includes(m.module) &&
        (segment === "all" || segment === m.module)
    );
  }, [modules, segment]);

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-danger-text">{loadError}</p>
      </div>
    );
  }

  if (!modules) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in-up space-y-4 p-6">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const showSegments = modules.length > 1;
  const segments: Segment[] = ["all", ...modules];
  const segmentLabel: Record<Segment, string> = {
    all: "ทั้งหมด",
    user: "ผู้ใช้ทั่วไป",
    approver: "ผู้อนุมัติ",
    admin: "ผู้ดูแลระบบ",
  };

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHero
        title="คู่มือการใช้งานระบบ"
        subtitle="อธิบายขั้นตอนการทำงานของระบบ ปรับเนื้อหาให้ตรงกับสิทธิ์การใช้งานของคุณ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto -mt-6 max-w-2xl px-6">
        {showSegments ? (
          <div className="mb-4 flex flex-wrap gap-2">
            {segments.map((s) => {
              const active = segment === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSegment(s)}
                  className={`rounded-[2px] border px-3 py-1.5 text-sm font-bold transition-colors ${
                    active
                      ? "bg-grad-brand shadow-brand border-transparent text-text-on-primary"
                      : "border-neutral-300 bg-surface-card text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {segmentLabel[s]}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="space-y-6">
          {visibleModules.map((mod) => (
            <section key={mod.module} className="space-y-3">
              <h2 className="text-xl font-extrabold tracking-tight text-text-primary">
                สำหรับ{mod.label}
              </h2>
              {mod.sections.map((section) => (
                <WorkflowSteps key={section.id} section={section} />
              ))}
              {mod.showApprovalChain ? <ApprovalChainDiagram /> : null}
            </section>
          ))}

          <StatusLegend />
        </div>
      </div>
    </div>
  );
}
