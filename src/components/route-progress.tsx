"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Slim top progress bar for client navigations (Academic Authority) */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPhase("run"));
    const almost = window.setTimeout(() => setPhase("done"), 280);
    const hide = window.setTimeout(() => setPhase("idle"), 520);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(almost);
      window.clearTimeout(hide);
    };
  }, [pathname, search]);

  if (phase === "idle") return null;

  return (
    <div
      className={`route-progress route-progress--${phase}`}
      aria-hidden
    />
  );
}
