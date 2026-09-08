import { createHash, createHmac, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

export const LOGIN_MAX_AGE = 7 * 24 * 60 * 60;

export function deviceSessionPrefix(userId: string, fingerprint: string) {
  return `${createHash("sha256").update(`${userId}:${fingerprint}`).digest("hex")}.`;
}

export function credentialStamp(user: { id: string; role: string; passwordHash: string | null }) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required");
  return createHmac("sha256", secret)
    .update(JSON.stringify([user.id, user.role, user.passwordHash]))
    .digest("hex");
}

export async function createLoginSession(userId: string, fingerprint: string) {
  await prisma.session.deleteMany({ where: { userId, expires: { lte: new Date() } } });
  const sessionToken = `${deviceSessionPrefix(userId, fingerprint)}${randomUUID()}`;
  await prisma.session.create({
    data: { userId, sessionToken, expires: new Date(Date.now() + LOGIN_MAX_AGE * 1000) },
  });
  return sessionToken;
}

export async function validateLoginSession(token: Record<string, unknown>) {
  if (typeof token.id !== "string" || typeof token.loginSession !== "string"
    || typeof token.credentialStamp !== "string" || typeof token.fingerprint !== "string") return false;
  if (!token.loginSession.startsWith(deviceSessionPrefix(token.id, token.fingerprint))) return false;
  const session = await prisma.session.findUnique({
    where: { sessionToken: token.loginSession },
    include: { user: true },
  });
  return Boolean(session && session.userId === token.id && session.expires > new Date()
    && session.user.role === token.role && credentialStamp(session.user) === token.credentialStamp);
}
