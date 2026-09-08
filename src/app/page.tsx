import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { HomeCta } from "@/components/home-cta";
import { Icon } from "@/components/icon";

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

      <div className="hero__features">
        <div className="hero-feature-card">
          <div className="hero-feature-card__icon" aria-hidden>
            <Icon name="key" size={24} />
          </div>
          <div className="hero-feature-card__content">
            <h3>เข้าเรียนได้ทันที</h3>
            <p>ใช้อีเมลและคีย์ที่ได้รับจากร้านค้า ไม่ต้องจำรหัสผ่านให้ยุ่งยาก</p>
          </div>
        </div>

        <div className="hero-feature-card">
          <div className="hero-feature-card__icon" aria-hidden>
            <Icon name="devices" size={24} />
          </div>
          <div className="hero-feature-card__content">
            <h3>บันทึกความคืบหน้า</h3>
            <p>ระบบบันทึกจุดที่เรียนค้างไว้ สามารถสลับอุปกรณ์และเรียนต่อได้ราบรื่น</p>
          </div>
        </div>

        <div className="hero-feature-card">
          <div className="hero-feature-card__icon" aria-hidden>
            <Icon name="speed" size={24} />
          </div>
          <div className="hero-feature-card__content">
            <h3>ปรับสปีดได้ตามใจ</h3>
            <p>รองรับการปรับความเร็ววิดีโอ 1.25x - 2.0x พร้อมภาพคมชัดระดับ HD</p>
          </div>
        </div>
      </div>
    </section>
  );
}
