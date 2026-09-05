import type { Metadata } from "next";
import { Inter, Noto_Sans_Thai, Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { Providers } from "@/components/providers";
import { SiteChrome } from "@/components/site-chrome";
import { SiteHeader } from "@/components/site-header";
import "material-symbols/outlined.css";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  preload: true,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.AUTH_URL ?? "https://minuteslearn.vercel.app",
  ),
  title: {
    default: "MinutesLearn — เรียนคอร์สวิดีโอ",
    template: "%s · MinutesLearn",
  },
  description:
    "แพลตฟอร์มเรียนคอร์สวิดีโอ Minutes Sharing — ซื้อที่ร้าน แล้วเข้าเรียนด้วยอีเมล + คีย์",
  applicationName: "MinutesLearn",
  openGraph: {
    title: "MinutesLearn",
    description:
      "เรียนคอร์สวิดีโอด้วยอีเมล + คีย์ หลังซื้อจาก minutessharing.com",
    siteName: "MinutesLearn",
    locale: "th_TH",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: "/logo-minutes-sharing.png", type: "image/png" }],
    apple: [{ url: "/logo-minutes-sharing.png", type: "image/png" }],
  },
};

function HeaderFallback() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <span className="brand">
          <span className="brand__name">MinutesLearn</span>
        </span>
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${plusJakarta.variable} ${inter.variable} ${notoThai.variable} h-full`}
    >
      <body className="min-h-full flex flex-col antialiased">
        <Providers>
          <SiteChrome
            header={
              <Suspense fallback={<HeaderFallback />}>
                <SiteHeader />
              </Suspense>
            }
            footer={
              <footer className="footer">
                ซื้อคอร์สที่{" "}
                <a
                  href="https://minutessharing.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  minutessharing.com
                </a>{" "}
                · <a href="/terms">ข้อตกลงการใช้งาน</a>
              </footer>
            }
          >
            {children}
          </SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
