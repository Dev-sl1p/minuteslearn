import type { Metadata } from "next";
import { Figtree, Syne } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MinutesLearn — Video Courses",
  description:
    "เรียนคอร์สวิดีโอจาก MinutesSharing ด้วย license key หลังซื้อจากร้าน",
  icons: {
    icon: [
      { url: "/favicon-minutes-sharing.png", type: "image/png" },
      { url: "/logo-minutes-sharing.png", type: "image/png" },
    ],
    apple: [{ url: "/favicon-minutes-sharing.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${syne.variable} ${figtree.variable} h-full`}>
      <body className="min-h-full flex flex-col antialiased">
        <Providers>
          <SiteHeader />
          <main>{children}</main>
          <footer className="footer">
            ซื้อคอร์สที่{" "}
            <a
              href="https://minutessharing.com/"
              target="_blank"
              rel="noreferrer"
            >
              minutessharing.com
            </a>{" "}
            ·{" "}
            <a href="/terms">ข้อตกลงการใช้งาน</a>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
