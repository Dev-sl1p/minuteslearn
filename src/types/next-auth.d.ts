import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      fingerprint: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    fingerprint?: string;
    credentialStamp?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    fingerprint?: string;
    credentialStamp?: string;
    loginSession?: string;
  }
}
