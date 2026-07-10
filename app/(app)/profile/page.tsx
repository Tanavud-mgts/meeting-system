"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";

type Profile = {
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
  phone: string | null;
  staff_id: string | null;
  welpru_verified_at: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  user: "ผู้ใช้ทั่วไป",
  approver: "ผู้อนุมัติ",
  admin: "ผู้ดูแลระบบ",
};

type EditForm = {
  full_name: string;
  staff_id: string;
  phone: string;
  department: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    full_name: "",
    staff_id: "",
    phone: "",
    department: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [welpruVerifiedAt, setWelpruVerifiedAt] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [requestingVerify, setRequestingVerify] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("full_name, email, role, department, phone, staff_id, welpru_verified_at")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        setLoadError("ไม่สามารถโหลดข้อมูลโปรไฟล์ได้");
        setLoading(false);
        return;
      }

      setProfile(data as Profile);
      setWelpruVerifiedAt((data as Profile).welpru_verified_at);
      setLoading(false);
    }
    load();
  }, []);

  function startEditing() {
    if (!profile) return;
    setForm({
      full_name: profile.full_name,
      staff_id: profile.staff_id ?? "",
      phone: profile.phone ?? "",
      department: profile.department ?? "",
    });
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (form.full_name.trim().length === 0) {
      setSaveError("กรุณากรอกชื่อ-นามสกุล");
      return;
    }

    setSaving(true);
    setSaveError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSaveError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSaving(false);
      return;
    }

    // RLS "users: update own (role locked)" allows this because role is not set.
    const { error } = await supabase
      .from("users")
      .update({
        full_name: form.full_name.trim(),
        staff_id: form.staff_id.trim() || null,
        phone: form.phone.trim() || null,
        department: form.department.trim() || null,
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      setSaveError("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            full_name: form.full_name.trim(),
            staff_id: form.staff_id.trim() || null,
            phone: form.phone.trim() || null,
            department: form.department.trim() || null,
          }
        : prev
    );
    setEditing(false);
  }

  async function handleRequestWelpruVerify() {
    if (!profile?.staff_id || profile.staff_id.trim().length === 0) {
      setVerifyMessage("กรุณากรอกและบันทึกรหัสบุคลากรก่อนขอยืนยัน");
      return;
    }
    if (!consentChecked) {
      setVerifyMessage("กรุณายอมรับเงื่อนไขการรับแจ้งเตือนก่อน");
      return;
    }

    setRequestingVerify(true);
    setVerifyMessage(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setVerifyMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setRequestingVerify(false);
      return;
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-welpru-verify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ staff_id: profile.staff_id }),
      }
    );

    setRequestingVerify(false);

    if (!response.ok) {
      setVerifyMessage("ส่งคำขอยืนยันไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    setVerifyMessage("ส่งแจ้งเตือนทดสอบไปยัง WeLPRU แล้ว กรุณาแตะลิงก์ในแอปเพื่อยืนยัน");
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">โปรไฟล์ของฉัน</h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}

      {!loading && profile && (
        <>
          {/* Gradient header */}
          <div className="mt-4 overflow-hidden rounded-lg shadow-card">
            <div
              className="flex items-center gap-4 p-5"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Avatar name={profile.full_name} size="lg" tone="inverse" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-text-on-primary">
                  {profile.full_name}
                </p>
                <p className="truncate text-sm text-text-on-primary opacity-90">
                  {profile.email}
                </p>
                <span className="mt-2 inline-block rounded-pill bg-surface-card px-2.5 py-0.5 text-xs font-semibold text-brand-primary">
                  {ROLE_LABEL[profile.role] ?? profile.role}
                </span>
              </div>
            </div>
          </div>

          {/* Info / edit */}
          <Card className="mt-4">
            {!editing ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-text-secondary">ชื่อ-นามสกุล</p>
                    <p className="text-text-primary">{profile.full_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">อีเมล</p>
                    <p className="text-text-primary">{profile.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">รหัสบุคลากร</p>
                    <p className="text-text-primary">
                      {profile.staff_id ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">เบอร์โทรศัพท์</p>
                    <p className="text-text-primary">{profile.phone ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">หน่วยงาน</p>
                    <p className="text-text-primary">
                      {profile.department ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">บทบาท</p>
                    <p className="text-text-primary">
                      {ROLE_LABEL[profile.role] ?? profile.role}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <Button onClick={startEditing}>แก้ไขข้อมูล</Button>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm text-text-secondary">
                    ชื่อ-นามสกุล
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={(e) =>
                        setForm({ ...form, full_name: e.target.value })
                      }
                      className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-text-secondary">
                    รหัสบุคลากร
                    <input
                      type="text"
                      value={form.staff_id}
                      onChange={(e) =>
                        setForm({ ...form, staff_id: e.target.value })
                      }
                      className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-text-secondary">
                    เบอร์โทรศัพท์
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-text-secondary">
                    หน่วยงาน
                    <input
                      type="text"
                      value={form.department}
                      onChange={(e) =>
                        setForm({ ...form, department: e.target.value })
                      }
                      className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
                    />
                  </label>
                </div>

                <p className="mt-3 text-xs text-text-secondary">
                  อีเมลและบทบาทแก้ไขไม่ได้ (บทบาทเปลี่ยนโดยผู้ดูแลระบบเท่านั้น)
                </p>

                {saveError && (
                  <p className="mt-2 text-sm text-danger-text">{saveError}</p>
                )}

                <div className="mt-4 flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                  >
                    ยกเลิก
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? "กำลังบันทึก..." : "บันทึก"}
                  </Button>
                </div>
              </>
            )}
          </Card>

          <Card className="mt-4">
            <p className="font-medium text-text-primary">เชื่อมต่อ LINE</p>
            <p className="mt-1 text-sm text-text-secondary">
              เร็วๆ นี้ — ระบบแจ้งเตือนผ่าน LINE อยู่ระหว่างการพัฒนา
            </p>
          </Card>

          <Card className="mt-4">
            <p className="font-medium text-text-primary">
              ยืนยันการรับแจ้งเตือนผ่าน WeLPRU
            </p>
            {welpruVerifiedAt ? (
              <p className="mt-1 text-sm text-success-text">
                ✅ ยืนยันแล้วเมื่อ{" "}
                {new Date(welpruVerifiedAt).toLocaleDateString("th-TH", {
                  dateStyle: "medium",
                })}
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-text-secondary">
                  ยืนยันตัวตนเพื่อรับการแจ้งเตือนผ่านแอป WeLPRU — ระบบจะส่งข้อความทดสอบไปยังแอปของท่าน
                  กรุณาแตะลิงก์ในข้อความเพื่อยืนยันว่าเป็นเจ้าของบัญชีจริง
                </p>
                <label className="mt-3 flex items-start gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5"
                  />
                  ข้าพเจ้ายินยอมให้ระบบส่งการแจ้งเตือนผ่านแอป WeLPRU ไปยังรหัสบุคลากรที่ระบุไว้
                </label>
                {verifyMessage && (
                  <p className="mt-2 text-sm text-text-secondary">{verifyMessage}</p>
                )}
                <div className="mt-3">
                  <Button onClick={handleRequestWelpruVerify} disabled={requestingVerify}>
                    {requestingVerify ? "กำลังส่ง..." : "ยืนยันการรับแจ้งเตือนผ่าน WeLPRU"}
                  </Button>
                </div>
              </>
            )}
          </Card>

          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
