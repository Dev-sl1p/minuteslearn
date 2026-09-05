"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Icon } from "@/components/icon";

export type ToastKind = "ok" | "error" | "info";

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
};

type ToastApi = {
  push: (kind: ToastKind, title: string, detail?: string) => void;
  ok: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, title: string, detail?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev.slice(-4), { id, kind, title, detail }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      ok: (title, detail) => push("ok", title, detail),
      error: (title, detail) => push("error", title, detail),
      info: (title, detail) => push("info", title, detail),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  item,
  onClose,
}: {
  item: ToastItem;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, item.kind === "error" ? 6000 : 3800);
    return () => clearTimeout(timer);
  }, [item.kind, onClose]);

  const label =
    item.kind === "ok" ? "สำเร็จ" : item.kind === "error" ? "ผิดพลาด" : "แจ้งเตือน";

  return (
    <div className={`toast toast--${item.kind}`} role="status">
      <div className="toast__badge">{label}</div>
      <div className="toast__body">
        <p className="toast__title">{item.title}</p>
        {item.detail ? <p className="toast__detail">{item.detail}</p> : null}
      </div>
      <button
        type="button"
        className="toast__close"
        aria-label="ปิดการแจ้งเตือน"
        onClick={onClose}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
