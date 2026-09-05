import { LoadingBlock } from "@/components/loading";

export default function DevicesLoading() {
  return (
    <div className="dash" style={{ padding: "2rem 1rem" }}>
      <LoadingBlock label="กำลังโหลดอุปกรณ์..." />
    </div>
  );
}
