import { prisma } from "@/lib/db";
import { parseSupabaseStorageObject } from "@/lib/supabase-storage-url";

export async function storageCoverVisibility(bucket: string, path: string) {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return null;
  const hostname = new URL(configured).hostname;
  // A document can never become public through the cover endpoint.
  const resource = await prisma.lessonResource.findFirst({ where: { storagePath: path }, select: { id: true } });
  if (resource) return null;
  const courses = await prisma.course.findMany({
    where: { coverUrl: { not: null } }, select: { coverUrl: true, published: true },
  });
  const matches = courses.filter((course) => {
    try {
      if (!course.coverUrl || new URL(course.coverUrl).hostname !== hostname) return false;
      const object = parseSupabaseStorageObject(course.coverUrl);
      return object?.bucket === bucket && object.path === path;
    } catch { return false; }
  });
  return matches.some((course) => course.published) ? "public" : matches.length ? "draft" : null;
}

export function rasterImageType(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (/^GIF8[79]a$/.test(b.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (b.subarray(4, 8).toString() === "ftyp" && /^(avif|avis)$/.test(b.subarray(8, 12).toString())) return "image/avif";
  return null;
}
