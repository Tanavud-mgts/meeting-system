import { AppError } from "./errors.ts";

type Handler = (req: Request) => Promise<Response>;

// Edge Functions run on a different origin (*.supabase.co) than the
// frontend (localhost in dev, the Vercel domain in production), so every
// response — including the OPTIONS preflight — must carry these headers or
// the browser silently blocks the call before JS ever sees a status code.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export function withErrorHandling(handler: Handler): Handler {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      return withCors(await handler(req));
    } catch (err) {
      if (err instanceof AppError) {
        return withCors(
          new Response(
            JSON.stringify({ error: err.code, message: err.message }),
            {
              status: err.statusCode,
              headers: { "Content-Type": "application/json" },
            }
          )
        );
      }

      console.error("Unhandled error in edge function:", err);

      return withCors(
        new Response(
          JSON.stringify({
            error: "INTERNAL_ERROR",
            message: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        )
      );
    }
  };
}
