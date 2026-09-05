import { LoadingBlock } from "@/components/loading";

export default function RedeemLoading() {
  return (
    <div className="dash" style={{ padding: "2rem 1rem" }}>
      <LoadingBlock label="กำลังโหลด..." />
    </div>
  );
}
