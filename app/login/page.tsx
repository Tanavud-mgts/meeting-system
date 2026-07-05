"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const PASSWORD_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true";

// Thai messages for the ?error query param set by the middleware / callback.
const ERROR_MESSAGES: Record<string, string> = {
  domain: "อนุญาตเฉพาะอีเมล @g.lpru.ac.th เท่านั้น",
  auth: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Read the ?error param client-side (avoids needing a Suspense boundary for
  // useSearchParams on this small page).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    if (code && ERROR_MESSAGES[code]) {
      setError(ERROR_MESSAGES[code]);
    }
  }, []);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: "g.lpru.ac.th", prompt: "select_account" },
      },
    });

    if (oauthError) {
      setError("ไม่สามารถเริ่มการเข้าสู่ระบบด้วย Google ได้");
      setGoogleLoading(false);
    }
    // On success the browser is redirected to Google, so no further UI update.
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }

    router.push("/home");
    router.refresh();
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm animate-fade-in-up">
        <div className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-text-primary">
            เข้าสู่ระบบ
          </h1>
          <p className="text-sm text-text-secondary">
            ระบบจองห้องประชุม มหาวิทยาลัยราชภัฏลำปาง
          </p>

          {error && <p className="text-sm text-danger-text">{error}</p>}

          <Button onClick={handleGoogleSignIn} disabled={googleLoading}>
            {googleLoading
              ? "กำลังเปลี่ยนเส้นทาง..."
              : "เข้าสู่ระบบด้วย Google (@g.lpru.ac.th)"}
          </Button>

          {PASSWORD_LOGIN_ENABLED && (
            <>
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                <span className="h-px flex-1 bg-neutral-200" />
                หรือเข้าสู่ระบบสำหรับทดสอบ
                <span className="h-px flex-1 bg-neutral-200" />
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <input
                  type="email"
                  required
                  placeholder="อีเมล"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="rounded border border-neutral-300 px-3 py-2 text-text-primary"
                />
                <input
                  type="password"
                  required
                  placeholder="รหัสผ่าน"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="rounded border border-neutral-300 px-3 py-2 text-text-primary"
                />
                <Button type="submit" variant="secondary" disabled={loading}>
                  {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบด้วยรหัสผ่าน"}
                </Button>
              </form>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
