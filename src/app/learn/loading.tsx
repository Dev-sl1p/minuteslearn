import { LoadingBlock } from "@/components/loading";

export default function LearnLoading() {
  return (
    <div className="shell" style={{ padding: "2rem 1rem" }}>
      <LoadingBlock label="กำลังเปิดบทเรียน..." />
    </div>
  );
}
