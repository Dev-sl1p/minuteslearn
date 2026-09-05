/**
 * One-shot: scrub demo HLS URLs from lessons + rotate admin password.
 * Usage: npx tsx scripts/prepare-production.ts
 */
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_STREAM =
  /test-streams\.mux\.dev|bitdash-a\.akamaihd\.net|devstreaming-cdn\.apple\.com/i;

async function main() {
  const lessons = await prisma.lesson.findMany({
    select: { id: true, title: true, streamAssetId: true },
  });

  let cleared = 0;
  for (const lesson of lessons) {
    if (lesson.streamAssetId && DEMO_STREAM.test(lesson.streamAssetId)) {
      await prisma.lesson.update({
        where: { id: lesson.id },
        data: { streamAssetId: null },
      });
      cleared += 1;
      console.log(`Cleared demo stream: ${lesson.title}`);
    }
  }

  const password =
    process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim() ||
    `Ml-${randomBytes(6).toString("base64url")}`;
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.update({
    where: { email: "admin@minutessharing.com" },
    data: { passwordHash, role: "ADMIN" },
  });

  console.log("---");
  console.log(`Demo streams cleared: ${cleared}`);
  console.log(`Admin email: ${admin.email}`);
  console.log(`Admin password (save now): ${password}`);
  console.log("---");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
