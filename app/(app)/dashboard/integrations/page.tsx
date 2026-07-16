"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/PageHero";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { FieldTable } from "@/components/ui/FieldTable";
import { StatusMarker } from "@/components/ui/StatusMarker";

type ServiceName =
  | "make_com"
  | "line"
  | "welpru"
  | "discord"
  | "google_calendar"
  | "vercel"
  | "internal";

type QuotaRow = {
  service: ServiceName;
  total_calls: number;
  success_count: number;
  failed_count: number;
  last_called_at: string | null;
};

type FailedLogRow = {
  id: string;
  service: ServiceName;
  error_detail: string | null;
  created_at: string;
};

const SERVICES: ServiceName[] = [
  "make_com",
  "line",
  "welpru",
  "discord",
  "google_calendar",
  "vercel",
  "internal",
];

const SERVICE_LABEL: Record<ServiceName, string> = {
  make_com: "Make.com",
  line: "LINE",
  welpru: "WeLPRU",
  discord: "Discord",
  google_calendar: "Google Calendar",
  vercel: "Vercel",
  internal: "ภายในระบบ",
};

const REFERENCE_LIMIT: Partial<Record<ServiceName, string>> = {
  make_com:
    "อ้างอิง Make.com Free Plan: 1,000 credits/เดือน (นับรวมทุกการเรียก ไม่ใช่จำนวน credit จริง)",
  line: "อ้างอิง LINE OA Free Plan: 500 ครั้ง/เดือน (นับรวมทุกการเรียก ไม่ได้แยก push/reply)",
};

const PAGE_SIZE = 20;

function emptyQuotaRow(service: ServiceName): QuotaRow {
  return {
    service,
    total_calls: 0,
    success_count: 0,
    failed_count: 0,
    last_called_at: null,
  };
}

export default function DashboardIntegrationsPage() {
  const [quotaMap, setQuotaMap] = useState<Record<string, QuotaRow>>({});
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const [failedLogs, setFailedLogs] = useState<FailedLogRow[]>([]);
  const [serviceFilter, setServiceFilter] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [logsError, setLogsError] = useState<string | null>(null);

  async function loadQuota() {
    setQuotaError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("integration_monthly_usage")
      .select("service, total_calls, success_count, failed_count, last_called_at");

    if (error) {
      setQuotaError("ไม่สามารถโหลดข้อมูล Quota ได้");
      return;
    }

    const map: Record<string, QuotaRow> = {};
    for (const row of (data ?? []) as QuotaRow[]) {
      map[row.service] = row;
    }
    setQuotaMap(map);
  }

  async function loadFailedLogs() {
    setLogsError(null);

    const supabase = createClient();
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("integration_health")
      .select("id, service, error_detail, created_at", { count: "exact" })
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (serviceFilter) {
      query = query.eq("service", serviceFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      setLogsError("ไม่สามารถโหลดรายการที่ล้มเหลวได้");
      return;
    }

    setFailedLogs((data ?? []) as FailedLogRow[]);
    setTotalCount(count ?? 0);
  }

  useEffect(() => {
    loadQuota();
  }, []);

  useEffect(() => {
    loadFailedLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, serviceFilter]);

  function handleServiceFilterChange(value: string) {
    setServiceFilter(value);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="Integration Health"
        subtitle="สถานะการเชื่อมต่อบริการภายนอกและโควตาการแจ้งเตือน"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">
        {quotaError && (
          <p className="text-sm text-danger-text">{quotaError}</p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SERVICES.map((service) => {
            const row = quotaMap[service] ?? emptyQuotaRow(service);
            const referenceLimit = REFERENCE_LIMIT[service];
            const health =
              row.failed_count > 0
                ? "danger"
                : row.total_calls > 0
                  ? "success"
                  : "neutral";
            const healthLabel =
              health === "danger"
                ? "มีข้อผิดพลาด"
                : health === "success"
                  ? "ปกติ"
                  : "ยังไม่เรียก";
            return (
              <EditorialCard
                key={service}
                accent={health === "neutral" ? "none" : health}
              >
                <EditorialCard.Section>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-md font-bold text-text-primary">
                      {SERVICE_LABEL[service]}
                    </p>
                    <StatusMarker tone={health}>{healthLabel}</StatusMarker>
                  </div>
                </EditorialCard.Section>

                <EditorialCard.Section className="!py-0">
                  <FieldTable
                    rows={[
                      { label: "เรียกทั้งหมด", value: `${row.total_calls} ครั้ง` },
                      { label: "สำเร็จ", value: row.success_count },
                      { label: "ล้มเหลว", value: row.failed_count },
                      {
                        label: "ล่าสุด",
                        value: row.last_called_at
                          ? new Date(row.last_called_at).toLocaleString("th-TH")
                          : "ยังไม่เคยเรียกเดือนนี้",
                        mono: row.last_called_at !== null,
                      },
                    ]}
                  />
                </EditorialCard.Section>

                {referenceLimit && (
                  <EditorialCard.Section>
                    <p className="text-xs text-text-muted">{referenceLimit}</p>
                  </EditorialCard.Section>
                )}
              </EditorialCard>
            );
          })}
        </div>

        <div className="mt-6">
          <SectionTitle>รายการที่ล้มเหลวล่าสุด</SectionTitle>
        </div>

        <div className="mt-4">
          <select
            value={serviceFilter}
            onChange={(e) => handleServiceFilterChange(e.target.value)}
            className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
          >
            <option value="">ทั้งหมด</option>
            {SERVICES.map((service) => (
              <option key={service} value={service}>
                {SERVICE_LABEL[service]}
              </option>
            ))}
          </select>
        </div>

        {logsError && (
          <p className="mt-4 text-sm text-danger-text">{logsError}</p>
        )}

        {!logsError && failedLogs.length === 0 && (
          <div className="mt-4 rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
            ไม่พบรายการที่ล้มเหลว
          </div>
        )}

        <div className="mt-4 space-y-4">
          {failedLogs.map((log) => (
            <EditorialCard key={log.id} accent="danger">
              <EditorialCard.Section>
                <div className="flex items-center justify-between gap-2">
                  <StatusMarker tone="danger">
                    {SERVICE_LABEL[log.service]}
                  </StatusMarker>
                  <span className="font-mono text-xs text-text-muted">
                    {new Date(log.created_at).toLocaleString("th-TH")}
                  </span>
                </div>
              </EditorialCard.Section>
              {log.error_detail && (
                <EditorialCard.Section>
                  <p className="text-sm text-text-primary">{log.error_detail}</p>
                </EditorialCard.Section>
              )}
            </EditorialCard>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ก่อนหน้า
          </Button>
          <span className="text-sm text-text-secondary">
            หน้า {page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
          >
            ถัดไป
          </Button>
        </div>
      </div>
    </div>
  );
}
