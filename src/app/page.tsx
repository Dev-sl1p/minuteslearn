import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { HomeCta } from "@/components/home-cta";

function CtaFallback() {
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

export default function HomePage() {
  return (
    <section className="hero">
      <div className="hero__brand">
        <Image
          src="/logo-minutes-sharing.png"
          alt="Minutes Sharing"
          width={104}
          height={104}
          className="hero__logo"
          priority
          fetchPriority="high"
          sizes="(max-width: 640px) 72px, 104px"
        />
        <p className="hero__brand-name">MinutesLearn</p>
      </div>
      <h1>เรียนคอร์สออนไลน์</h1>
      <p>
        ซื้อคอร์สที่ minutessharing.com แล้วนำอีเมลกับคีย์
        มาเข้าเรียนที่นี่ คีย์จะผูกกับอีเมลครั้งแรกที่ใช้
      </p>
      <div className="hero__cta">
        <Suspense fallback={<CtaFallback />}>
          <HomeCta />
        </Suspense>
      </div>
    </section>
  );
}
