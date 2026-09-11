import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { authConfig } from "@/lib/auth.config";
import { createLoginSession, credentialStamp, validateLoginSession } from "@/lib/auth-session";
import { prisma } from "@/lib/db";
import { loginWithEmailAndLicense } from "@/lib/license-login";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const identitySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  fingerprint: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
});
const licenseSchema = identitySchema.extend({ licenseKey: z.string().trim().min(4).max(128) });
const adminSchema = identitySchema.extend({ password: z.string().min(6).max(256) });

class LoginError extends CredentialsSignin {
  constructor(code: string) { super(); this.code = code; }
}

async function checkLoginLimit(kind: "license" | "admin", email: string, req: Request) {
  const ip = getClientIp(req);
  const limits = await Promise.all([
    rateLimit({ key: `auth:${kind}:ip:${ip}`, limit: kind === "admin" ? 15 : 30, windowMs: 15 * 60 * 1000 }),
    rateLimit({ key: `auth:${kind}:email:${email}`, limit: kind === "admin" ? 10 : 20, windowMs: 60 * 60 * 1000 }),
  ]);
  if (limits.some((limit) => !limit.ok)) {
    await logSecurityEvent({ type: "RATE_LIMITED", severity: "warn", message: "Login rate limited", actorEmail: email, ip });
    throw new LoginError("RATE_LIMITED");
  }
  return ip;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id && user.fingerprint && user.credentialStamp) {
        token.id = user.id;
        token.role = user.role;
        token.fingerprint = user.fingerprint;
        token.credentialStamp = user.credentialStamp;
        token.loginSession = await createLoginSession(user.id, user.fingerprint);
      }
      // Legacy cookies and revoked sessions must authenticate again.
      return (await validateLoginSession(token)) ? token : null;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && message.token?.loginSession) {
        await prisma.session.deleteMany({ where: { sessionToken: message.token.loginSession } });
      }
    },
  },
  logger: {
    error(error) {
      if (error?.name === "JWTSessionError" || error instanceof CredentialsSignin) return;
      console.error(error);
    },
  },
  providers: [
    Credentials({
      id: "license", name: "License key",
      credentials: { email: {}, licenseKey: {}, fingerprint: {} },
      async authorize(raw, req) {
        const parsed = licenseSchema.safeParse(raw);
        if (!parsed.success) throw new LoginError("EMPTY");
        const { email, fingerprint, licenseKey } = parsed.data;
        const ip = await checkLoginLimit("license", email, req);
        try {
          const result = await loginWithEmailAndLicense({ email, licenseKey });
          if (result.ok && result.user.role !== "USER") throw new LoginError("INVALID_KEY");
          if (!result.ok) {
            const meta =
              "productId" in result || "productSku" in result
                ? {
                    error: result.error,
                    productId: result.productId,
                    productSku: result.productSku,
                  }
                : null;
            await logSecurityEvent({
              type: "LOGIN_FAIL",
              severity: "warn",
              message: `License login failed: ${result.error}`,
              actorEmail: email,
              ip,
              meta,
            });
            throw new LoginError(result.error);
          }
          await logSecurityEvent({ type: "LOGIN_OK", message: "License login success", actorId: result.user.id, actorEmail: email, ip });
          return { id: result.user.id, email, name: result.user.name, role: result.user.role, fingerprint, credentialStamp: credentialStamp(result.user) };
        } catch (error) {
          if (error instanceof LoginError) throw error;
          await logSecurityEvent({ type: "LOGIN_FAIL", severity: "warn", message: "License service unavailable", actorEmail: email, ip });
          throw new LoginError("SERVICE_UNAVAILABLE");
        }
      },
    }),
    Credentials({
      id: "admin", name: "Admin password",
      credentials: { email: {}, password: {}, fingerprint: {} },
      async authorize(raw, req) {
        const parsed = adminSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, fingerprint } = parsed.data;
        const ip = await checkLoginLimit("admin", email, req);
        const user = await prisma.user.findUnique({ where: { email } });
        const valid = user?.role === "ADMIN" && user.passwordHash && await bcrypt.compare(password, user.passwordHash);
        if (!valid || !user) {
          await logSecurityEvent({ type: "ADMIN_LOGIN_FAIL", severity: "warn", message: "Admin credentials rejected", actorEmail: email, ip });
          return null;
        }
        await logSecurityEvent({ type: "ADMIN_LOGIN_OK", message: "Admin login success", actorId: user.id, actorEmail: email, ip });
        return { id: user.id, email, name: user.name, role: user.role, fingerprint, credentialStamp: credentialStamp(user) };
      },
    }),
  ],
});
