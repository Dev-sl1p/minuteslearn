import { NextResponse } from "next/server";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { redeemLicenseKey } from "@/lib/redeem";
import {
  getClientIp,
  rateLimit,
  rateLimitResponse,
} from "@/lib/rate-limit";

const schema = z.object({
  licenseKey: z.string().min(4).max(128),
  deviceFingerprint: z.string().min(8).max(128).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const limited = await rateLimit({
    key: `redeem:${session.user.id}:${ip}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!limited.ok) {
    await logSecurityEvent({
      type: "RATE_LIMITED",
      severity: "warn",
      message: "Redeem rate limited",
      actorId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });
    return rateLimitResponse(limited.resetAt);
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const instanceId =
    parsed.data.deviceFingerprint ?? `user:${session.user.id}`;

  try {
    const result = await redeemLicenseKey({
      userId: session.user.id,
      licenseKey: parsed.data.licenseKey,
      instanceId,
    });

    if (!result.ok) {
      await logSecurityEvent({
        type: "REDEEM_FAIL",
        severity: "warn",
        message: `Redeem failed: ${result.error}`,
        actorId: session.user.id,
        actorEmail: session.user.email,
        ip,
        meta: { error: result.error },
      });
      const messages: Record<string, string> = {
        EMPTY_KEY: "กรุณาใส่ license key",
        ALREADY_YOURS: "คีย์นี้ถูกผูกกับบัญชีคุณแล้ว",
        ALREADY_REDEEMED: "คีย์นี้ถูกใช้โดยบัญชีอื่นแล้ว",
        INVALID_KEY: "คีย์ไม่ถูกต้องหรือหมดอายุ",
        ACTIVATION_LIMIT: "คีย์นี้ถูก activate ครบจำนวนแล้ว",
        NO_COURSE_MAPPING:
          "ยังไม่ได้ผูกสินค้า WooCommerce กับคอร์ส — ติดต่อแอดมิน",
        WP_ACTIVATE_FAILED:
          result.message ?? "เปิดใช้งานคีย์บน WordPress ไม่สำเร็จ",
      };
      return NextResponse.json(
        { error: messages[result.error] ?? result.error },
        { status: 400 },
      );
    }

    await logSecurityEvent({
      type: "REDEEM_OK",
      message: `Redeemed course ${result.course.slug}`,
      actorId: session.user.id,
      actorEmail: session.user.email,
      ip,
      meta: { courseId: result.course.id },
    });

    return NextResponse.json({
      ok: true,
      course: {
        id: result.course.id,
        title: result.course.title,
        slug: result.course.slug,
      },
    });
  } catch (e) {
    console.error(e);
    await logSecurityEvent({
      type: "REDEEM_FAIL",
      severity: "critical",
      message: "Redeem exception",
      actorId: session.user.id,
      actorEmail: session.user.email,
      ip,
    });
    return NextResponse.json(
      { error: "Redeem failed — check WordPress API config" },
      { status: 500 },
    );
  }
}
