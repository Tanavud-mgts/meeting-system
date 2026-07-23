"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/PageHero";
import { EditorialCard } from "@/components/ui/EditorialCard";

type Profile = {
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
  phone: string | null;
  staff_id: string | null;
  welpru_verified_at: string | null;
  line_user_id: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  user: "ผู้ใช้ทั่วไป",
  approver: "ผู้อนุมัติ",
  admin: "ผู้ดูแลระบบ",
};

// LINE Official Account id ของระบบ (@521soden) — ใช้ทั้งลิงก์เพิ่มเพื่อนและแสดงเป็น ID ให้ค้นหาในแอป
// ตั้ง NEXT_PUBLIC_LINE_OA_ID ใน env เพื่อ override ได้ (fallback = ค่าโปรดักชันปัจจุบัน)
const LINE_OA_ID = process.env.NEXT_PUBLIC_LINE_OA_ID ?? "521soden";

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

  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [lineOtp, setLineOtp] = useState<string | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [generatingOtp, setGeneratingOtp] = useState(false);
  const [lineMessage, setLineMessage] = useState<string | null>(null);

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
        .select("full_name, email, role, department, phone, staff_id, welpru_verified_at, line_user_id")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        setLoadError("ไม่สามารถโหลดข้อมูลโปรไฟล์ได้");
        setLoading(false);
        return;
      }

      setProfile(data as Profile);
      setWelpruVerifiedAt((data as Profile).welpru_verified_at);
      setLineUserId((data as Profile).line_user_id);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (otpSecondsLeft <= 0) return;
    const timer = setInterval(() => setOtpSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [otpSecondsLeft]);

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

  async function handleGenerateLineOtp() {
    setGeneratingOtp(true);
    setLineMessage(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLineMessage("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setGeneratingOtp(false);
      return;
    }
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-line-otp`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      }
    );
    setGeneratingOtp(false);
    if (!response.ok) {
      setLineMessage("สร้างรหัสไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    const data = (await response.json()) as { otp: string; expiresInMinutes: number };
    setLineOtp(data.otp);
    setOtpSecondsLeft(data.expiresInMinutes * 60);
  }

  async function handleUnlinkLine() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("users").update({ line_user_id: null }).eq("id", user.id);
    if (error) {
      setLineMessage("ยกเลิกการเชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setLineUserId(null);
    setLineOtp(null);
    setOtpSecondsLeft(0);
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="โปรไฟล์ของฉัน"
        subtitle="ข้อมูลบัญชีและการเชื่อมต่อการแจ้งเตือน"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      )}

      {!loading && profile && (
        <>
          {/* หัวข้อมูลตัวตน — flat */}
          <EditorialCard accent="brand">
            <EditorialCard.Section>
              <div className="flex items-center gap-4">
                <Avatar name={profile.full_name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold text-text-primary">
                    {profile.full_name}
                  </p>
                  <p className="truncate text-sm text-text-secondary">
                    {profile.email}
                  </p>
                  <span className="mt-2 inline-block rounded-[2px] bg-neutral-150 px-2.5 py-0.5 text-xs font-bold text-brand-primary-strong">
                    {ROLE_LABEL[profile.role] ?? profile.role}
                  </span>
                </div>
              </div>
            </EditorialCard.Section>
          </EditorialCard>

          {/* Info / edit */}
          <EditorialCard className="mt-4">
            <EditorialCard.Section>
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
            </EditorialCard.Section>
          </EditorialCard>

          <EditorialCard className="mt-4">
            <EditorialCard.Section>
            <SectionTitle>เชื่อมต่อ LINE</SectionTitle>
            {lineUserId ? (
              <>
                <p className="mt-1 text-sm text-success-text">
                  ✅ เชื่อมต่อบัญชี LINE แล้ว
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  ท่านจะได้รับ Flex Message พร้อมปุ่มอนุมัติเมื่อมีคำขอที่ต้องพิจารณา
                </p>
                <div className="mt-3">
                  <Button variant="secondary" onClick={handleUnlinkLine}>
                    ยกเลิกการเชื่อมต่อ
                  </Button>
                </div>
              </>
            ) : lineOtp && otpSecondsLeft > 0 ? (
              <>
                <p className="mt-1 text-sm text-text-secondary">
                  เหลืออีกขั้นตอนเดียว — พิมพ์ข้อความด้านล่างในแชทกับ LINE Official Account
                  ของระบบ (หากยังไม่ได้เพิ่มเพื่อน ค้นหา ID{" "}
                  <span className="font-mono font-semibold text-text-primary">
                    @{LINE_OA_ID}
                  </span>{" "}
                  หรือ{" "}
                  <a
                    href={`https://line.me/R/ti/p/@${LINE_OA_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary hover:underline"
                  >
                    แตะที่นี่เพื่อเพิ่มเพื่อน
                  </a>
                  )
                </p>
                <div className="mt-3 rounded-[2px] border border-border-sunken bg-surface-sunken p-4">
                  <p className="text-xs font-bold tracking-wider text-text-muted">
                    พิมพ์ข้อความนี้ในแชท
                  </p>
                  <p className="mt-1 select-all font-mono text-lg font-bold text-text-primary">
                    /link {lineOtp}
                  </p>
                  <p className="mt-2 text-xs text-text-muted">
                    รหัสหมดอายุใน {Math.floor(otpSecondsLeft / 60)}:
                    {String(otpSecondsLeft % 60).padStart(2, "0")} นาที ·
                    เมื่อเชื่อมต่อสำเร็จ หน้านี้จะแสดงสถานะ “เชื่อมต่อแล้ว” อัตโนมัติ
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-text-secondary">
                  เชื่อมบัญชี LINE เพื่อรับการแจ้งเตือนคำขออนุมัติพร้อมปุ่มกดอนุมัติได้ทันทีในแชท
                  (ยังสามารถอนุมัติผ่านเว็บได้ตามปกติแม้ไม่เชื่อมต่อ LINE)
                </p>

                <div className="mt-3 rounded-[2px] border border-border-sunken bg-surface-sunken p-4">
                  <p className="text-xs font-bold tracking-wider text-text-muted">
                    วิธีเชื่อมต่อ (ทำครั้งเดียว)
                  </p>
                  <ol className="mt-3 space-y-3">
                    <li className="flex gap-3">
                      <span className="bg-grad-brand flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold text-text-on-primary">
                        1
                      </span>
                      <span className="text-sm text-text-secondary">
                        เพิ่มเพื่อน LINE Official Account ของระบบ — ค้นหา ID{" "}
                        <span className="font-mono font-semibold text-text-primary">
                          @{LINE_OA_ID}
                        </span>{" "}
                        <a
                          href={`https://line.me/R/ti/p/@${LINE_OA_ID}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-primary hover:underline"
                        >
                          (หรือแตะเพื่อเพิ่มเพื่อน)
                        </a>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="bg-grad-brand flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold text-text-on-primary">
                        2
                      </span>
                      <span className="text-sm text-text-secondary">
                        กดปุ่ม “เชื่อมต่อ LINE” ด้านล่าง เพื่อรับรหัสเชื่อมต่อ 6 หลัก
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="bg-grad-brand flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold text-text-on-primary">
                        3
                      </span>
                      <span className="text-sm text-text-secondary">
                        เปิดแชทกับ Official Account แล้วพิมพ์{" "}
                        <span className="font-mono font-semibold text-text-primary">
                          /link
                        </span>{" "}
                        เว้นวรรค ตามด้วยรหัส เช่น{" "}
                        <span className="font-mono font-semibold text-text-primary">
                          /link 123456
                        </span>
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="bg-grad-brand flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold text-text-on-primary">
                        4
                      </span>
                      <span className="text-sm text-text-secondary">
                        เมื่อระบบยืนยันสำเร็จ หน้านี้จะแสดงสถานะ “เชื่อมต่อแล้ว” อัตโนมัติ
                      </span>
                    </li>
                  </ol>
                </div>

                {lineMessage && (
                  <p className="mt-2 text-sm text-text-secondary">{lineMessage}</p>
                )}
                <div className="mt-3">
                  <Button onClick={handleGenerateLineOtp} disabled={generatingOtp}>
                    {generatingOtp ? "กำลังสร้างรหัส..." : "เชื่อมต่อ LINE"}
                  </Button>
                </div>
              </>
            )}
            </EditorialCard.Section>
          </EditorialCard>

          <EditorialCard className="mt-4">
            <EditorialCard.Section>
            <SectionTitle>ยืนยันการรับแจ้งเตือนผ่าน WeLPRU</SectionTitle>
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
            </EditorialCard.Section>
          </EditorialCard>

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
    </div>
  );
}
