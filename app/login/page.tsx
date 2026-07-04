"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const PASSWORD_LOGIN_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  if (!PASSWORD_LOGIN_ENABLED) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-text-secondary">
          ปิดใช้งานการเข้าสู่ระบบด้วยรหัสผ่านชั่วคราว
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm animate-fade-in-up">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-text-primary">
            เข้าสู่ระบบ (ทดสอบ)
          </h1>
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
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
