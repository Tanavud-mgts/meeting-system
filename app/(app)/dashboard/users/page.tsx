"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { FieldTable } from "@/components/ui/FieldTable";

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
  phone: string | null;
  staff_id: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  user: "ผู้ใช้ทั่วไป",
  approver: "ผู้อนุมัติ",
  admin: "ผู้ดูแลระบบ",
};

export default function DashboardUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [chainIds, setChainIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [anonymizeTarget, setAnonymizeTarget] = useState<UserRow | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();

    const [usersRes, configRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, full_name, email, role, department, phone, staff_id")
        .order("full_name", { ascending: true }),
      supabase
        .from("system_config")
        .select("admin_id, approver1_id, approver2_id")
        .single(),
    ]);

    if (usersRes.error) {
      setLoadError("ไม่สามารถโหลดรายชื่อผู้ใช้ได้");
      setLoading(false);
      return;
    }

    setUsers((usersRes.data ?? []) as UserRow[]);

    if (configRes.data) {
      setChainIds(
        new Set(
          [
            configRes.data.admin_id,
            configRes.data.approver1_id,
            configRes.data.approver2_id,
          ].filter((id): id is string => id !== null)
        )
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleRoleChange(
    user: UserRow,
    newRole: "user" | "approver" | "admin"
  ) {
    setSavingId(user.id);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ role: newRole })
      .eq("id", user.id);

    setSavingId(null);

    if (error) {
      setActionError("บันทึก role ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  async function handleDepartmentBlur(user: UserRow, newDepartment: string) {
    if (newDepartment === (user.department ?? "")) return;

    setSavingId(user.id);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ department: newDepartment.trim() || null })
      .eq("id", user.id);

    setSavingId(null);

    if (error) {
      setActionError("บันทึกหน่วยงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  async function handleConfirmAnonymize() {
    if (!anonymizeTarget) return;

    setSubmitting(true);
    setActionError(null);

    const supabase = createClient();
    const { error } = await supabase.rpc(
      "anonymize_user_on_delete_request",
      { p_user_id: anonymizeTarget.id }
    );

    setSubmitting(false);
    setAnonymizeTarget(null);

    if (error) {
      setActionError("ลบข้อมูลส่วนตัวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadUsers();
  }

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="จัดการผู้ใช้"
        subtitle="กำหนดบทบาทและสิทธิ์ผู้ใช้งานในระบบ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">

      {loadError && (
        <p className="text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="text-sm text-danger-text">{actionError}</p>
      )}

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="space-y-4">
          {users.map((u) => (
            <EditorialCard
              key={u.id}
              accent={chainIds.has(u.id) ? "brand" : "none"}
            >
              <EditorialCard.Section>
                <div className="flex items-center gap-3">
                  <Avatar name={u.full_name} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold text-text-primary">
                        {u.full_name}
                      </p>
                      {chainIds.has(u.id) && (
                        <span className="rounded-[2px] bg-neutral-150 px-2 py-0.5 text-xs font-bold text-brand-primary-strong">
                          ใน Approval Chain
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-text-secondary">
                      {u.email}
                    </p>
                  </div>
                </div>
              </EditorialCard.Section>

              <EditorialCard.Section className="!py-0">
                <FieldTable
                  rows={[
                    { label: "รหัสบุคลากร", value: u.staff_id ?? "—" },
                    { label: "เบอร์โทร", value: u.phone ?? "—" },
                    { label: "บทบาท", value: ROLE_LABEL[u.role] ?? u.role },
                  ]}
                />
              </EditorialCard.Section>

              <EditorialCard.Section>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={u.role}
                    disabled={savingId === u.id}
                    onChange={(e) =>
                      handleRoleChange(
                        u,
                        e.target.value as "user" | "approver" | "admin"
                      )
                    }
                    className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="user">{ROLE_LABEL.user}</option>
                    <option value="approver">{ROLE_LABEL.approver}</option>
                    <option value="admin">{ROLE_LABEL.admin}</option>
                  </select>
                  <input
                    type="text"
                    defaultValue={u.department ?? ""}
                    disabled={savingId === u.id}
                    onBlur={(e) => handleDepartmentBlur(u, e.target.value)}
                    placeholder="หน่วยงาน"
                    className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
                  />
                  <Button variant="danger" onClick={() => setAnonymizeTarget(u)}>
                    ลบข้อมูลส่วนตัว (PDPA)
                  </Button>
                </div>
              </EditorialCard.Section>
            </EditorialCard>
          ))}
        </div>
      )}

      <Modal
        open={anonymizeTarget !== null}
        onClose={() => setAnonymizeTarget(null)}
      >
        {anonymizeTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการลบข้อมูลส่วนตัว
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {anonymizeTarget.full_name} ({anonymizeTarget.email})
            </p>
            <p className="mt-2 text-sm text-danger-text">
              การกระทำนี้จะลบชื่อ อีเมล และ LINE ID ของผู้ใช้นี้ถาวร
              กู้คืนไม่ได้ (ประวัติการจองและการอนุมัติยังคงอยู่)
            </p>
            {chainIds.has(anonymizeTarget.id) && (
              <p className="mt-2 text-sm text-warning-text">
                ผู้ใช้นี้เป็นสมาชิกของ Approval Chain ปัจจุบัน
                การลบข้อมูลจะทำให้ขั้นตอนอนุมัตินั้นดำเนินการต่อไม่ได้
                จนกว่าจะเปลี่ยนสมาชิก Chain
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setAnonymizeTarget(null)}
              >
                ยกเลิก
              </Button>
              <Button
                variant="primary"
                className="bg-danger-solid hover:bg-danger-solid"
                onClick={handleConfirmAnonymize}
                disabled={submitting}
              >
                {submitting ? "กำลังลบ..." : "ยืนยันลบข้อมูล"}
              </Button>
            </div>
          </>
        )}
      </Modal>
      </div>
    </div>
  );
}
