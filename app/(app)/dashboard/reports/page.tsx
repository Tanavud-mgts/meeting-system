"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

type CountRow = { label: string; count: number };

type ReportStats = {
  year: number;
  month: number | null;
  roomUtilization: CountRow[];
  byDepartment: CountRow[];
};

const MONTH_LABEL: Record<number, string> = {
  1: "มกราคม",
  2: "กุมภาพันธ์",
  3: "มีนาคม",
  4: "เมษายน",
  5: "พฤษภาคม",
  6: "มิถุนายน",
  7: "กรกฎาคม",
  8: "สิงหาคม",
  9: "กันยายน",
  10: "ตุลาคม",
  11: "พฤศจิกายน",
  12: "ธันวาคม",
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function ReportsPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(0); // 0 = ทั้งปี
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/get-report-stats`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ year, month }),
          }
        );

        const result = await res.json();

        if (!res.ok) {
          setLoadError(result.message ?? "ไม่สามารถโหลดรายงานได้");
          setLoading(false);
          return;
        }

        setStats(result as ReportStats);
      } catch {
        setLoadError("ไม่สามารถโหลดรายงานได้");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [year, month]);

  const periodLabel =
    month === 0 ? `ปี ${year}` : `${MONTH_LABEL[month]} ${year}`;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">รายงาน</h1>
      <p className="mt-1 text-sm text-text-secondary">
        สรุปการใช้ห้องและการจองตามหน่วยงาน (นับเฉพาะการจองที่อนุมัติแล้ว)
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          ปี
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-text-secondary">
          เดือน
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
          >
            <option value={0}>ทั้งปี</option>
            {Object.entries(MONTH_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {loading && (
        <div className="mt-4 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!loading && !loadError && stats && (
        <div className="mt-4 space-y-4">
          <Card>
            <p className="font-medium text-text-primary">
              การใช้ห้องประชุม — {periodLabel}
            </p>
            {stats.roomUtilization.length === 0 ? (
              <p className="mt-2 text-sm text-text-secondary">
                ไม่มีข้อมูลในช่วงเวลานี้
              </p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary">
                    <th className="pb-2 font-medium">ห้อง</th>
                    <th className="pb-2 text-right font-medium">จำนวนครั้ง</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.roomUtilization.map((row) => (
                    <tr
                      key={row.label}
                      className="border-t border-neutral-200"
                    >
                      <td className="py-2 text-text-primary">{row.label}</td>
                      <td className="py-2 text-right text-text-primary">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <p className="font-medium text-text-primary">
              การจองตามหน่วยงาน — {periodLabel}
            </p>
            {stats.byDepartment.length === 0 ? (
              <p className="mt-2 text-sm text-text-secondary">
                ไม่มีข้อมูลในช่วงเวลานี้
              </p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary">
                    <th className="pb-2 font-medium">หน่วยงาน</th>
                    <th className="pb-2 text-right font-medium">จำนวนครั้ง</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byDepartment.map((row) => (
                    <tr
                      key={row.label}
                      className="border-t border-neutral-200"
                    >
                      <td className="py-2 text-text-primary">{row.label}</td>
                      <td className="py-2 text-right text-text-primary">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <p className="text-xs text-text-secondary">
            หมายเหตุ: ดาวน์โหลดข้อมูลดิบได้ที่หน้า ข้อมูล/Export
          </p>
        </div>
      )}
    </div>
  );
}
