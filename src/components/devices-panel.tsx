"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { LoadingBlock, Spinner } from "@/components/loading";
import { useToast } from "@/components/toast";
import { getDeviceFingerprint, getDeviceLabel } from "@/lib/fingerprint";

type Device = {
  id: string;
  fingerprint: string;
  label: string | null;
  lastSeenAt: string;
  revokedAt: string | null;
};

export function DevicesPanel() {
  const toast = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [max, setMax] = useState(2);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [currentFp, setCurrentFp] = useState("");

  async function load() {
    const res = await fetch("/api/devices");
    const data = await res.json();
    if (!res.ok) {
      toast.error("โหลดอุปกรณ์ไม่สำเร็จ", data.error);
      setLoading(false);
      return;
    }
    setDevices(data.devices);
    setMax(data.maxDevices);
    setLoading(false);
  }

  useEffect(() => {
    setCurrentFp(getDeviceFingerprint());
    void (async () => {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint: getDeviceFingerprint(),
          label: getDeviceLabel(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.devices)) {
        setDevices(data.devices);
        setMax(data.maxDevices ?? 2);
        setLoading(false);
        if (!res.ok && data.error) {
          toast.error("ลงทะเบียนอุปกรณ์ไม่สำเร็จ", data.error);
        }
        return;
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revoke(id: string) {
    setPendingId(id);
    const res = await fetch(`/api/devices?id=${id}`, { method: "DELETE" });
    setPendingId(null);
    if (!res.ok) {
      const data = await res.json();
      toast.error("ปลดอุปกรณ์ไม่สำเร็จ", data.error);
      return;
    }
    toast.ok("ปลดอุปกรณ์แล้ว");
    await load();
  }

  if (loading) {
    return <LoadingBlock label="กำลังโหลดรายการอุปกรณ์..." />;
  }

  const active = devices.filter((d) => !d.revokedAt);
  const revoked = devices.filter((d) => d.revokedAt);

  return (
    <div className="stack page-enter">
      <div className="device-panel panel anim-rise">
        <div className="device-panel__head">
          <div>
            <h2 className="device-panel__title">อุปกรณ์ที่เข้าสู่ระบบ</h2>
            <p className="device-panel__hint">
              ใช้อุปกรณ์ได้สูงสุด {max} เครื่อง — หากไม่รู้จักเครื่องใด
              ให้ปลดออกทันที
            </p>
          </div>
        </div>

        <div className="device-list">
          {active.map((d) => {
            const isCurrent = d.fingerprint === currentFp;
            return (
              <article
                key={d.id}
                className={`device-card${isCurrent ? " device-card--current" : ""}`}
              >
                <div
                  className={`device-card__icon${isCurrent ? " device-card__icon--current" : ""}`}
                  aria-hidden
                >
                  <Icon
                    name={isCurrent ? "smartphone" : "devices"}
                    filled={isCurrent}
                    size={22}
                  />
                </div>
                <div className="device-card__body">
                  <div className="device-card__title-row">
                    <h3>{d.label ?? "อุปกรณ์"}</h3>
                    {isCurrent && (
                      <span className="badge badge--current">เครื่องนี้</span>
                    )}
                  </div>
                  <p className="muted">
                    เห็นล่าสุด{" "}
                    {new Date(d.lastSeenAt).toLocaleString("th-TH")}
                  </p>
                  <p className="device-card__fp muted">
                    <code>{d.fingerprint.slice(0, 18)}…</code>
                  </p>
                </div>
                {!isCurrent && (
                  <button
                    type="button"
                    className="btn btn--ghost device-card__remove"
                    disabled={pendingId === d.id}
                    onClick={() => void revoke(d.id)}
                  >
                    {pendingId === d.id ? (
                      <Spinner size="sm" label="..." />
                    ) : (
                      "ลบอุปกรณ์"
                    )}
                  </button>
                )}
              </article>
            );
          })}

          {active.length === 0 && (
            <p className="muted">ยังไม่มีอุปกรณ์ที่ลงทะเบียน</p>
          )}
        </div>

        {revoked.length > 0 && (
          <div className="device-list device-list--revoked">
            <p className="muted">ระงับแล้ว ({revoked.length})</p>
            {revoked.map((d) => (
              <article key={d.id} className="device-card device-card--revoked">
                <div className="device-card__body">
                  <h3>{d.label ?? "อุปกรณ์"}</h3>
                  <span className="badge badge--bad">ระงับแล้ว</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
