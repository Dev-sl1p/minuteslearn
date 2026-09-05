import { LoadingBlock } from "@/components/loading";

export default function AdminLoading() {
  return (
    <div style={{ padding: "2rem 1rem" }}>
      <LoadingBlock label="กำลังโหลดหลังบ้าน..." />
    </div>
  );
}
