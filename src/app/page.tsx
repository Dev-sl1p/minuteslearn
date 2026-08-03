import Image from "next/image";
import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <section className="hero">
      <div className="hero__brand">
        <Image
          src="/logo-minutes-sharing.png"
          alt="Minutes Sharing"
          width={160}
          height={160}
          className="hero__logo"
          priority
        />
        <p className="hero__brand-name">MinutesLearn</p>
      </div>
      <h1>เรียนคอร์สวิดีโอด้วยอีเมล + license key</h1>
      <p>
        ซื้อที่ minutessharing.com แล้วใส่อีเมลกับคีย์ที่นี่เพื่อเข้าเรียน
        คีย์จะผูกกับอีเมลครั้งแรกที่ใช้ — ลดการแชร์คีย์ให้คนอื่น
      </p>
      <div className="hero__cta">
        {session?.user ? (
          <Link href="/library" className="btn btn--primary">
            คอร์สของฉัน
          </Link>
        ) : (
          <Link href="/login" className="btn btn--primary">
            เข้าเรียนด้วยอีเมล + คีย์
          </Link>
        )}
      </div>
    </section>
  );
}
