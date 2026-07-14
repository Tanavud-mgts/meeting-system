"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

type Status = "loading" | "success" | "error";

// Public route (ไม่อยู่ใต้ (app) จึงไม่ถูก middleware บังคับ login) — ยืนยันด้วย
// token อย่างเดียว เพื่อให้ลิงก์กดจาก in-app browser ของ WeLPRU (ที่ไม่ได้ login
// เว็บ) ทำงานได้ token ถูกส่งไปเฉพาะแอปของเจ้าของบัญชี = หลักฐานตัวตนในตัว
export default function WelpruVerifyPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function confirm() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setMessage("ไม่พบ token ยืนยัน กรุณาตรวจสอบลิงก์อีกครั้ง");
        return;
      }

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/confirm-welpru-verify`,
          {
            method: "POST",
            headers: {
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setStatus("error");
          setMessage(
            data?.message ?? "ยืนยันไม่สำเร็จ ลิงก์อาจหมดอายุหรือถูกใช้ไปแล้ว"
          );
          return;
        }

        setStatus("success");
        setMessage("ยืนยันการรับแจ้งเตือนผ่าน WeLPRU สำเร็จแล้ว");
      } catch {
        setStatus("error");
        setMessage("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      }
    }
    confirm();
  }, []);

  return (
    <div className="mx-auto max-w-md animate-fade-in-up p-6">
      <Card>
        {status === "loading" && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {status === "success" && (
          <>
            <p className="text-lg font-semibold text-success-text">
              ✅ {message}
            </p>
            <Link
              href="/profile"
              className="mt-3 inline-block text-sm text-brand-primary hover:underline"
            >
              ไปหน้าโปรไฟล์
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-lg font-semibold text-danger-text">❌ {message}</p>
            <Link
              href="/profile"
              className="mt-3 inline-block text-sm text-brand-primary hover:underline"
            >
              ไปหน้าโปรไฟล์
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
