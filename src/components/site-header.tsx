import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { SiteNav } from "@/components/site-nav";

export async function SiteHeader() {
  const session = await auth();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand">
          <Image
            src="/logo-minutes-sharing.png"
            alt="Minutes Sharing"
            width={40}
            height={40}
            className="brand__logo"
            priority
          />
          <span className="brand__name">MinutesLearn</span>
        </Link>
        <SiteNav
          signedIn={Boolean(session?.user)}
          isAdmin={session?.user?.role === "ADMIN"}
          signOutAction={signOutAction}
        />
      </div>
    </header>
  );
}
