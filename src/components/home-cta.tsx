import Link from "next/link";
import { auth } from "@/lib/auth";

/** Isolated so the hero H1 can stream without waiting on session */
export async function HomeCta() {
  const session = await auth();

  if (session?.user) {
    return (
      <Link href="/library" className="btn btn--primary">
        คอร์สของฉัน
      </Link>
    );
  }

  return (
    <>
      <Link href="/login" className="btn btn--primary">
        เข้าเรียน
      </Link>
      <a
        href="https://minutessharing.com/"
        className="btn btn--ghost"
        target="_blank"
        rel="noreferrer"
      >
        ซื้อคอร์ส
      </a>
    </>
  );
}
