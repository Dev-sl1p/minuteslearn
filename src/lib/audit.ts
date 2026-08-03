import { prisma } from "@/lib/db";

export type SecurityEventType =
  | "LOGIN_OK"
  | "LOGIN_FAIL"
  | "ADMIN_LOGIN_OK"
  | "ADMIN_LOGIN_FAIL"
  | "REDEEM_OK"
  | "REDEEM_FAIL"
  | "LICENSE_REVOKE"
  | "COURSE_SAVE"
  | "COURSE_DELETE"
  | "LESSON_SAVE"
  | "LESSON_DELETE"
  | "RATE_LIMITED"
  | "SECURITY";

export async function logSecurityEvent(input: {
  type: SecurityEventType | string;
  message: string;
  severity?: "info" | "warn" | "critical";
  actorId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  try {
    await prisma.securityEvent.create({
      data: {
        type: input.type,
        severity: input.severity ?? "info",
        message: input.message.slice(0, 500),
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        ip: input.ip ?? null,
        meta: input.meta ? JSON.stringify(input.meta).slice(0, 2000) : null,
      },
    });
  } catch (e) {
    console.error("logSecurityEvent failed", e);
  }

  const webhook = process.env.SECURITY_WEBHOOK_URL?.trim();
  if (
    webhook &&
    (input.severity === "warn" || input.severity === "critical")
  ) {
    void fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[${input.severity}] ${input.type}: ${input.message}`,
        ...input,
      }),
    }).catch(() => undefined);
  }
}
