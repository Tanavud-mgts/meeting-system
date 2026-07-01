import { AppError } from "./errors.ts";

type Handler = (req: Request) => Promise<Response>;

export function withErrorHandling(handler: Handler): Handler {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof AppError) {
        return new Response(
          JSON.stringify({ error: err.code, message: err.message }),
          {
            status: err.statusCode,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      console.error("Unhandled error in edge function:", err);

      return new Response(
        JSON.stringify({
          error: "INTERNAL_ERROR",
          message: "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  };
}
