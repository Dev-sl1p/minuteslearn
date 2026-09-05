import { parseSupabaseStorageObject } from "@/lib/supabase-storage-url";

type Props = {
  src: string;
  alt?: string;
  loading?: "lazy" | "eager";
  className?: string;
};

export function proxiedCoverSrc(src: string) {
  const value = src.trim();
  if (!value || value.startsWith("/") || value.startsWith("data:")) {
    return value;
  }

  const storage = parseSupabaseStorageObject(value);
  if (storage) {
    const params = new URLSearchParams({
      bucket: storage.bucket,
      path: storage.path,
    });
    return `/api/cover?${params.toString()}`;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return `/api/cover?url=${encodeURIComponent(url.toString())}`;
    }
  } catch {
    return value;
  }
  return value;
}

/** Course covers go through same-origin /api/cover (Supabase Storage or external https). */
export function CoverImage({
  src,
  alt = "",
  loading = "lazy",
  className,
}: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxiedCoverSrc(src)}
      alt={alt}
      loading={loading}
      referrerPolicy="no-referrer"
      className={className}
    />
  );
}
