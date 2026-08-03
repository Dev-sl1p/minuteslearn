"use client";

import { useEffect, useState } from "react";
import { getDeviceFingerprint, getDeviceLabel } from "@/lib/fingerprint";

type Device = {
  id: string;
  fingerprint: string;
  label: string | null;
  lastSeenAt: string;
  revokedAt: string | null;
};

export function DevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [max, setMax] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [currentFp, setCurrentFp] = useState("");

  async function load() {
    const res = await fetch("/api/devices");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "โหลดไม่สำเร็จ");
      return;
    }
    setDevices(data.devices);
    setMax(data.maxDevices);
  }

  useEffect(() => {
    setCurrentFp(getDeviceFingerprint());
    void load();
    void fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fingerprint: getDeviceFingerprint(),
        label: getDeviceLabel(),
      }),
    }).then(() => load());
  }, []);

  async function revoke(id: string) {
    const res = await fetch(`/api/devices?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "ปลดอุปกรณ์ไม่สำเร็จ");
      return;
    }
    await load();
  }

  return (
    <div className="stack">
      <p className="muted">
        ใช้อุปกรณ์ได้สูงสุด {max} เครื่อง · fingerprint ปัจจุบัน:{" "}
        <code>{currentFp.slice(0, 18)}…</code>
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>อุปกรณ์</th>
              <th>เห็นล่าสุด</th>
              <th>สถานะ</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.label ?? "Device"}
                  {d.fingerprint === currentFp ? " (เครื่องนี้)" : ""}
                </td>
                <td>{new Date(d.lastSeenAt).toLocaleString("th-TH")}</td>
                <td>
                  {d.revokedAt ? (
                    <span className="badge badge--bad">ระงับ</span>
                  ) : (
                    <span className="badge badge--ok">ใช้งานได้</span>
                  )}
                </td>
                <td>
                  {!d.revokedAt && (
                    <button
                      type="button"
                      className="btn btn--danger"
                      onClick={() => revoke(d.id)}
                    >
                      ปลด
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
