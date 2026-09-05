import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { logSecurityEvent } from "@/lib/audit";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/db";
import { loginWithEmailAndLicense } from "@/lib/license-login";
import { rateLimit } from "@/lib/rate-limit";

const licenseSchema = z.object({
  email: z.string().email(),
  licenseKey: z.string().min(4),
});

const adminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // Stale cookies after AUTH_SECRET rotate decode as JWTSessionError;
  // Auth.js already clears them — don't surface as a red console error.
  logger: {
    error(error) {
      if (
        error?.name === "JWTSessionError" ||
        (typeof error === "object" &&
          error &&
          "type" in error &&
          error.type === "JWTSessionError")
      ) {
        return;
      }
      console.error(error);
    },
  },
  providers: [
    Credentials({
      id: "license",
      name: "License key",
      credentials: {
        email: { label: "Email", type: "email" },
        licenseKey: { label: "License key", type: "text" },
      },
      async authorize(raw) {
        const parsed = licenseSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const limited = await rateLimit({
          key: `auth-license:${email}`,
          limit: 20,
          windowMs: 15 * 60 * 1000,
        });
        if (!limited.ok) {
          await logSecurityEvent({
            type: "RATE_LIMITED",
            severity: "warn",
            message: `License auth rate limited: ${email}`,
            actorEmail: email,
          });
          return null;
        }

        const result = await loginWithEmailAndLicense({
          email: parsed.data.email,
          licenseKey: parsed.data.licenseKey,
        });
        // LOGIN_OK / LOGIN_FAIL are logged in /api/license-login (has IP)
        if (!result.ok) return null;

        return {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
        };
      },
    }),
    Credentials({
      id: "admin",
      name: "Admin password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = adminSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const limited = await rateLimit({
          key: `auth-admin:${email}`,
          limit: 10,
          windowMs: 15 * 60 * 1000,
        });
        if (!limited.ok) {
          await logSecurityEvent({
            type: "RATE_LIMITED",
            severity: "warn",
            message: `Admin auth rate limited: ${email}`,
            actorEmail: email,
          });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user?.passwordHash || user.role !== "ADMIN") {
          await logSecurityEvent({
            type: "ADMIN_LOGIN_FAIL",
            severity: "critical",
            message: "Admin login failed — unknown user or not admin",
            actorEmail: email,
          });
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) {
          await logSecurityEvent({
            type: "ADMIN_LOGIN_FAIL",
            severity: "critical",
            message: "Admin login failed — bad password",
            actorId: user.id,
            actorEmail: email,
          });
          return null;
        }

        await logSecurityEvent({
          type: "ADMIN_LOGIN_OK",
          message: "Admin login success",
          actorId: user.id,
          actorEmail: user.email,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});
