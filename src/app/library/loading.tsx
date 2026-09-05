import { LoadingBlock } from "@/components/loading";

export default function LibraryLoading() {
  return (
    <div className="dash" style={{ padding: "2rem 1rem" }}>
      <LoadingBlock label="กำลังโหลดคอร์สของคุณ..." />
    </div>
  );
}
