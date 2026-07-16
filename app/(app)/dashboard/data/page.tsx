"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/PageHero";
import { EditorialCard } from "@/components/ui/EditorialCard";

type Dataset = "bookings" | "approval_history" | "users";

const DATASET_LABEL: Record<Dataset, string> = {
  bookings: "การจอง",
  approval_history: "ประวัติการอนุมัติ",
  users: "ผู้ใช้",
};

export default function DashboardDataPage() {
  const [activityRetention, setActivityRetention] = useState("");
  const [integrationRetention, setIntegrationRetention] = useState("");
  const [lineTokenRetention, setLineTokenRetention] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const [retentionSuccess, setRetentionSuccess] = useState<string | null>(
    null
  );
  const [retentionSubmitting, setRetentionSubmitting] = useState(false);
  const [exportingDataset, setExportingDataset] = useState<Dataset | null>(
    null
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [cleanupSubmitting, setCleanupSubmitting] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupSuccess, setCleanupSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      setLoadError(null);

      const supabase = createClient();
      const { data, error } = await supabase
        .from("system_config")
        .select(
          "activity_log_retention_months, integration_log_retention_months, line_token_retention_days"
        )
        .single();

      if (error || !data) {
        setLoadError("ไม่สามารถโหลดการตั้งค่าได้");
        return;
      }

      setActivityRetention(String(data.activity_log_retention_months));
      setIntegrationRetention(
        String(data.integration_log_retention_months)
      );
      setLineTokenRetention(String(data.line_token_retention_days));
    }

    loadConfig();
  }, []);

  async function handleExport(dataset: Dataset) {
    setExportingDataset(dataset);
    setExportError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setExportError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setExportingDataset(null);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/export-data`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dataset }),
        }
      );

      if (!res.ok) {
        const result = await res.json();
        setExportError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dataset}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setExportingDataset(null);
    }
  }

  async function handleRetentionSubmit() {
    setRetentionSubmitting(true);
    setRetentionError(null);
    setRetentionSuccess(null);

    const activityNum = Number(activityRetention);
    const integrationNum = Number(integrationRetention);
    const lineTokenNum = Number(lineTokenRetention);

    if (
      !Number.isInteger(activityNum) ||
      activityNum <= 0 ||
      !Number.isInteger(integrationNum) ||
      integrationNum <= 0 ||
      !Number.isInteger(lineTokenNum) ||
      lineTokenNum <= 0
    ) {
      setRetentionError("ค่าที่กรอกต้องเป็นจำนวนเต็มบวก");
      setRetentionSubmitting(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setRetentionError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setRetentionSubmitting(false);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-retention-settings`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            activity_log_retention_months: activityNum,
            integration_log_retention_months: integrationNum,
            line_token_retention_days: lineTokenNum,
          }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        setRetentionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setRetentionSuccess("บันทึกการตั้งค่าสำเร็จ");
    } catch {
      setRetentionError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setRetentionSubmitting(false);
    }
  }

  async function handleConfirmCleanup() {
    setCleanupSubmitting(true);
    setCleanupError(null);
    setCleanupSuccess(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setCleanupError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setCleanupSubmitting(false);
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cleanup-logs-now`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const result = await res.json();

      if (!res.ok) {
        setCleanupError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setCleanupSuccess("ล้าง log เก่าสำเร็จ");
      setCleanupConfirmOpen(false);
    } catch {
      setCleanupError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setCleanupSubmitting(false);
    }
  }

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="จัดการข้อมูล"
        subtitle="ส่งออกข้อมูลและจัดการการเก็บรักษาข้อมูล"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl space-y-6 px-6">

      {loadError && <p className="text-sm text-danger-text">{loadError}</p>}

      <EditorialCard>
        <EditorialCard.Section>
          <SectionTitle>Export ข้อมูล</SectionTitle>
          {exportError && (
            <p className="mt-2 text-sm text-danger-text">{exportError}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            {(["bookings", "approval_history", "users"] as Dataset[]).map(
              (dataset) => (
                <Button
                  key={dataset}
                  variant="secondary"
                  onClick={() => handleExport(dataset)}
                  disabled={exportingDataset === dataset}
                >
                  {exportingDataset === dataset
                    ? "กำลังสร้างไฟล์..."
                    : `Export ${DATASET_LABEL[dataset]} (CSV)`}
                </Button>
              )
            )}
          </div>
        </EditorialCard.Section>
      </EditorialCard>

      <EditorialCard>
        <EditorialCard.Section>
          <SectionTitle>Retention Settings</SectionTitle>
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-sm text-text-secondary">
                เก็บ Activity Log กี่เดือน
              </label>
              <input
                type="number"
                min={1}
                value={activityRetention}
                onChange={(e) => setActivityRetention(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary">
                เก็บ Integration Log กี่เดือน
              </label>
              <input
                type="number"
                min={1}
                value={integrationRetention}
                onChange={(e) => setIntegrationRetention(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
            <div>
              <label className="text-sm text-text-secondary">
                เก็บ LINE Token กี่วัน
              </label>
              <input
                type="number"
                min={1}
                value={lineTokenRetention}
                onChange={(e) => setLineTokenRetention(e.target.value)}
                className="mt-1 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
            </div>
          </div>
          {retentionError && (
            <p className="mt-2 text-sm text-danger-text">{retentionError}</p>
          )}
          {retentionSuccess && (
            <p className="mt-2 text-sm text-success-text">{retentionSuccess}</p>
          )}
          <Button
            onClick={handleRetentionSubmit}
            disabled={retentionSubmitting}
            className="mt-3"
          >
            {retentionSubmitting ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
          </Button>
        </EditorialCard.Section>
      </EditorialCard>

      <div className="rounded-[2px] border-l-[3px] border border-danger-border border-l-danger-solid bg-danger-surface p-4">
        <p className="font-bold text-danger-text">Danger Zone</p>
        <p className="mt-1 text-sm text-danger-text">
          การกระทำในส่วนนี้ไม่สามารถย้อนกลับได้
        </p>
        {cleanupError && (
          <p className="mt-2 text-sm text-danger-text">{cleanupError}</p>
        )}
        {cleanupSuccess && (
          <p className="mt-2 text-sm text-success-text">{cleanupSuccess}</p>
        )}
        <Button
          variant="primary"
          className="mt-3 bg-danger-solid hover:bg-danger-solid"
          onClick={() => setCleanupConfirmOpen(true)}
        >
          ล้าง log เก่าทันที
        </Button>
      </div>

      <Modal
        open={cleanupConfirmOpen}
        onClose={() => setCleanupConfirmOpen(false)}
      >
        <p className="text-lg font-extrabold text-text-primary">
          ยืนยันการล้าง log เก่า
        </p>
        <p className="mt-2 text-sm text-text-secondary">
          การกระทำนี้จะลบ Activity Log และ Integration Log
          ที่เก่าเกินระยะเวลาที่ตั้งไว้ถาวร กู้คืนไม่ได้
          (ไม่กระทบประวัติการอนุมัติและการยกเลิก ซึ่งเก็บถาวรเสมอ)
        </p>
        <div className="mt-4 flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setCleanupConfirmOpen(false)}
          >
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            className="bg-danger-solid hover:bg-danger-solid"
            onClick={handleConfirmCleanup}
            disabled={cleanupSubmitting}
          >
            {cleanupSubmitting ? "กำลังลบ..." : "ยืนยันลบ"}
          </Button>
        </div>
      </Modal>
      </div>
    </div>
  );
}
