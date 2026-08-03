import { NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { loginWithEmailAndLicense } from "@/lib/license-login";
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email().max(200),
  licenseKey: z.string().min(4).max(128),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limited = await rateLimit({
    key: `license-login:${ip}`,
    limit: 15,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    await logSecurityEvent({
      type: "RATE_LIMITED",
      severity: "warn",
      message: "License login IP rate limited",
      ip,
    });
    return rateLimitResponse(limited.resetAt);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "EMPTY" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const emailLimited = await rateLimit({
    key: `license-login-email:${email}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!emailLimited.ok) {
    await logSecurityEvent({
      type: "RATE_LIMITED",
      severity: "warn",
      message: `License login email rate limited: ${email}`,
      actorEmail: email,
      ip,
    });
    return rateLimitResponse(emailLimited.resetAt);
  }

  try {
    const result = await loginWithEmailAndLicense({
      email: parsed.data.email,
      licenseKey: parsed.data.licenseKey,
    });

    if (!result.ok) {
      await logSecurityEvent({
        type: "LOGIN_FAIL",
        severity: "warn",
        message: `License login failed: ${result.error}`,
        actorEmail: email,
        ip,
        meta: { error: result.error },
      });
      return NextResponse.json(
        {
          error: result.error,
          message: "message" in result ? result.message : undefined,
        },
        { status: 400 },
      );
    }

    await logSecurityEvent({
      type: "LOGIN_OK",
      message: result.firstBind
        ? "License first-bind login success"
        : "License login success",
      actorId: result.user.id,
      actorEmail: result.user.email,
      ip,
    });

    return NextResponse.json({
      ok: true,
      firstBind: result.firstBind,
      email: result.user.email,
      courseSlug:
        result.firstBind && "course" in result
          ? result.course.slug
          : undefined,
    });
  } catch (e) {
    console.error(e);
    await logSecurityEvent({
      type: "LOGIN_FAIL",
      severity: "critical",
      message: "License login exception",
      actorEmail: email,
      ip,
    });
    return NextResponse.json(
      { error: "WP_ACTIVATE_FAILED", message: "Login failed" },
      { status: 500 },
    );
  }
}
