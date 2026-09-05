import { LoadingBlock } from "@/components/loading";

export default function LoginLoading() {
  return (
    <div className="shell shell--narrow" style={{ padding: "2rem 1rem" }}>
      <LoadingBlock label="กำลังโหลด..." />
    </div>
  );
}
