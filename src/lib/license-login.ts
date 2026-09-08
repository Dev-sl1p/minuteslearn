import { prisma } from "@/lib/db";
import { redeemLicenseKey } from "@/lib/redeem";
import { validateLicense } from "@/lib/wp-license";
import { refreshLicenseStatus } from "@/lib/license-status";

/**
 * Binding rules:
 * 1) First successful email + key → key is permanently bound to that email.
 * 2) Later logins must use the same email + same key.
 * 3) If key is already bound to another email → reject.
 * 4) Logged-in users can still redeem extra keys for more courses (/redeem).
 */
export async function loginWithEmailAndLicense(input: {
  email: string;
  licenseKey: string;
  instanceId?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const key = input.licenseKey.trim();
  const instanceId = input.instanceId ?? `email:${email}`;

  if (!email || !key) {
    return { ok: false as const, error: "EMPTY" as const };
  }

  const existing = await prisma.license.findFirst({
    where: { key: { equals: key, mode: "insensitive" } },
    include: { user: true },
  });

  if (existing) {
    if (existing.user.role !== "USER") {
      return { ok: false as const, error: "INVALID_KEY" as const };
    }
    if (existing.status !== "ACTIVE") {
      return { ok: false as const, error: "REVOKED" as const };
    }
    if (existing.user.email.toLowerCase() !== email) {
      return { ok: false as const, error: "BOUND_OTHER_EMAIL" as const };
    }
    if (existing.expiresAt && existing.expiresAt <= new Date()) {
      return { ok: false as const, error: "INVALID_KEY" as const };
    }
    if (!(await refreshLicenseStatus(existing, true))) {
      return { ok: false as const, error: "INVALID_KEY" as const };
    }
    return {
      ok: true as const,
      user: existing.user,
      firstBind: false as const,
    };
  }

  // Optional: if Woo returns purchaser email, force first bind to match it
  const validated = await validateLicense(key);
  if (!validated || validated.status !== "active") {
    return {
      ok: false as const,
      error: "INVALID_KEY" as const,
      wpStatus: validated?.status ?? "missing",
    };
  }
  if (
    validated.customerEmail &&
    validated.customerEmail.toLowerCase() !== email
  ) {
    return { ok: false as const, error: "EMAIL_MISMATCH_ORDER" as const };
  }

  // New keys must not authenticate an existing identity. Add extra keys only
  // through /redeem after authenticating with that account's existing key.
  const account = await prisma.user.findUnique({ where: { email } });
  if (account) {
    return { ok: false as const, error: "USE_EXISTING_KEY" as const };
  }
  const user = await prisma.user.create({
    data: {
      email,
      name: email.split("@")[0] || "Learner",
      role: "USER",
    },
  });

  let bound = false;
  try {
    const redeemed = await redeemLicenseKey({
      userId: user.id,
      licenseKey: validated.key,
      instanceId,
    });

    if (!redeemed.ok) {
      return {
        ok: false as const,
        error: redeemed.error,
        message: "message" in redeemed ? redeemed.message : undefined,
        ...("productId" in redeemed
          ? { productId: redeemed.productId, productSku: redeemed.productSku }
          : {}),
      };
    }
    bound = true;

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return {
      ok: true as const,
      user: fresh,
      firstBind: true as const,
      course: redeemed.course,
    };
  } finally {
    // A rejected first bind must not leave an empty account that blocks retry.
    if (!bound) await prisma.user.deleteMany({
      where: { id: user.id, role: "USER", licenses: { none: {} }, entitlements: { none: {} } },
    });
  }
}
