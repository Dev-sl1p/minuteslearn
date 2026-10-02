import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { normalizeSlug, slugsMatch } from "@/lib/security";

type Props = {
  params: Promise<{ slug: string }>;
};

const RESERVED_PATHS = new Set([
  "admin",
  "devices",
  "learn",
  "library",
  "login",
  "redeem",
  "register",
  "terms",
  "api",
  "favicon.ico",
  "icon.png",
  "robots.txt",
]);

export default async function RootSlugRedirectPage({ params }: Props) {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);

  if (RESERVED_PATHS.has(slug.toLowerCase())) {
    notFound();
  }

  let course = await prisma.course.findFirst({
    where: {
      OR: [{ slug }, { slug: rawSlug }, { id: rawSlug }],
    },
    select: { slug: true },
  });

  if (!course) {
    const all = await prisma.course.findMany({ select: { slug: true } });
    course =
      all.find(
        (c) => slugsMatch(c.slug, rawSlug) || slugsMatch(c.slug, slug),
      ) ?? null;
  }

  if (!course) {
    notFound();
  }

  redirect(`/learn/${encodeURIComponent(course.slug)}`);
}
