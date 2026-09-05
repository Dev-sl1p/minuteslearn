import { prisma } from "@/lib/db";
import { activateLicense, validateLicense } from "@/lib/wp-license";

export async function redeemLicenseKey(input: {
  userId: string;
  licenseKey: string;
  instanceId: string;
}) {
  const key = input.licenseKey.trim();
  if (!key) {
    return { ok: false as const, error: "EMPTY_KEY" as const };
  }

  const already = await prisma.license.findFirst({
    where: { key: { equals: key, mode: "insensitive" } },
  });
  if (already) {
    if (already.userId === input.userId) {
      return { ok: false as const, error: "ALREADY_YOURS" as const };
    }
    return { ok: false as const, error: "ALREADY_REDEEMED" as const };
  }

  const validated = await validateLicense(key);
  if (!validated || validated.status !== "active") {
    return { ok: false as const, error: "INVALID_KEY" as const };
  }

  if (
    validated.timesActivatedMax != null &&
    validated.timesActivated != null &&
    validated.timesActivated >= validated.timesActivatedMax
  ) {
    return { ok: false as const, error: "ACTIVATION_LIMIT" as const };
  }

  const course = await findCourseForLicense(validated.productId, validated.productSku);
  if (!course) {
    return { ok: false as const, error: "NO_COURSE_MAPPING" as const };
  }

  const activation = await activateLicense(key, input.instanceId);
  if (!activation.ok) {
    return { ok: false as const, error: "WP_ACTIVATE_FAILED" as const, message: activation.message };
  }

  const expiresAt = validated.expiresAt ? new Date(validated.expiresAt) : null;

  const result = await prisma.$transaction(async (tx) => {
    const license = await tx.license.create({
      data: {
        key: validated.key || key,
        userId: input.userId,
        courseId: course.id,
        wooOrderId: validated.orderId,
        wooProductId: validated.productId,
        wooSku: validated.productSku ?? course.wooSku,
        status: "ACTIVE",
        expiresAt,
        wpActivated: true,
      },
    });

    const entitlement = await tx.entitlement.upsert({
      where: {
        userId_courseId: {
          userId: input.userId,
          courseId: course.id,
        },
      },
      create: {
        userId: input.userId,
        courseId: course.id,
        licenseId: license.id,
        expiresAt,
        status: "ACTIVE",
      },
      update: {
        licenseId: license.id,
        expiresAt,
        status: "ACTIVE",
      },
    });

    return { license, entitlement, course };
  });

  return { ok: true as const, ...result };
}

async function findCourseForLicense(
  productId?: string,
  productSku?: string,
) {
  if (productSku) {
    const bySku = await prisma.course.findFirst({
      where: { wooSku: { equals: productSku, mode: "insensitive" } },
    });
    if (bySku) return bySku;
  }
  if (productId) {
    const byId = await prisma.course.findFirst({
      where: { wooProductId: productId },
    });
    if (byId) return byId;
  }
  return null;
}

export async function isAdminUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === "ADMIN";
}

export async function userHasCourseAccess(
  userId: string,
  courseId: string,
  opts?: { isAdmin?: boolean },
) {
  // Prefer JWT role from session to skip an extra User lookup
  if (opts?.isAdmin === true) return true;
  if (opts?.isAdmin !== false && (await isAdminUser(userId))) return true;

  const entitlement = await prisma.entitlement.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!entitlement || entitlement.status !== "ACTIVE") return false;
  if (entitlement.expiresAt && entitlement.expiresAt < new Date()) return false;
  return true;
}
