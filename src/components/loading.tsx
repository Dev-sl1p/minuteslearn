"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  label?: string;
};

export function Spinner({ size = "md", label }: SpinnerProps) {
  return (
    <span
      className={`spinner spinner--${size}`}
      role="status"
      aria-label={label ?? "กำลังโหลด"}
    >
      <span className="spinner__ring" aria-hidden />
      {label ? <span className="spinner__label">{label}</span> : null}
    </span>
  );
}

/** Inline loading state (panels / admin refresh) */
export function LoadingBlock({
  label = "กำลังโหลด...",
}: {
  label?: string;
}) {
  return (
    <div className="loading-block">
      <Spinner size="lg" />
      <p>{label}</p>
    </div>
  );
}

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="page-loading__card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-minutes-sharing.png"
        alt=""
        width={48}
        height={48}
        className="page-loading__logo"
      />
      <Spinner size="md" />
      <p>{label}</p>
    </div>
  );
}

const subscribeToNothing = () => () => {};

function useMounted() {
  return useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

/** Full-viewport route loading — portaled to body so it covers legacy chrome */
export function PageLoading({
  label = "กำลังโหลด...",
}: {
  label?: string;
}) {
  const mounted = useMounted();

  const node = (
    <div
      className="page-loading"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <LoadingCard label={label} />
    </div>
  );

  if (!mounted || typeof document === "undefined") {
    return node;
  }
  return createPortal(node, document.body);
}

export function LoadingOverlay({
  show,
  label = "กำลังบันทึก...",
}: {
  show: boolean;
  label?: string;
}) {
  const mounted = useMounted();

  if (!show) return null;

  const node = (
    <div className="loading-overlay" role="alert" aria-busy="true">
      <div className="loading-overlay__card">
        <Spinner size="lg" />
        <p>{label}</p>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
