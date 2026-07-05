"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

type Profile = {
  full_name: string;
  email: string;
  role: "user" | "approver" | "admin";
  department: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  user: "ผู้ใช้ทั่วไป",
  approver: "ผู้อนุมัติ",
  admin: "ผู้ดูแลระบบ",
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

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
        .select("full_name, email, role, department")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        setLoadError("ไม่สามารถโหลดข้อมูลโปรไฟล์ได้");
        setLoading(false);
        return;
      }

      setProfile(data as Profile);
      setLoading(false);
    }
    load();
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">โปรไฟล์</h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!loading && profile && (
        <>
          <Card className="mt-4">
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-text-secondary">ชื่อ-นามสกุล</dt>
                <dd className="text-text-primary">{profile.full_name}</dd>
              </div>
              <div>
                <dt className="text-sm text-text-secondary">อีเมล</dt>
                <dd className="text-text-primary">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-text-secondary">บทบาท</dt>
                <dd className="text-text-primary">
                  {ROLE_LABEL[profile.role] ?? profile.role}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-text-secondary">หน่วยงาน</dt>
                <dd className="text-text-primary">
                  {profile.department ?? "—"}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="mt-4">
            <p className="font-medium text-text-primary">เชื่อมต่อ LINE</p>
            <p className="mt-1 text-sm text-text-secondary">
              เร็วๆ นี้ — ระบบแจ้งเตือนผ่าน LINE อยู่ระหว่างการพัฒนา
            </p>
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
