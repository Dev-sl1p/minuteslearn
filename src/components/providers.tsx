"use client";

import { Suspense } from "react";
import { SessionProvider } from "next-auth/react";
import { RouteProgress } from "@/components/route-progress";
import { ToastProvider } from "@/components/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </ToastProvider>
    </SessionProvider>
  );
}
