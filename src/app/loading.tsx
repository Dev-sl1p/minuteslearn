import { LoadingBlock } from "@/components/loading";

export default function RootLoading() {
  return (
    <div className="shell" style={{ padding: "2rem 1rem" }}>
      <LoadingBlock label="กำลังโหลด..." />
    </div>
  );
}
