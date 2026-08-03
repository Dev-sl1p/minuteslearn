import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(process.cwd(), "backups");
  await mkdir(dir, { recursive: true });

  const [
    users,
    courses,
    lessons,
    licenses,
    entitlements,
    devices,
    progress,
    securityEvents,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        // never dump password hashes in plain backup scripts by default — include hashed for restore
        passwordHash: true,
      },
    }),
    prisma.course.findMany(),
    prisma.lesson.findMany(),
    prisma.license.findMany(),
    prisma.entitlement.findMany(),
    prisma.device.findMany(),
    prisma.lessonProgress.findMany(),
    prisma.securityEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    counts: {
      users: users.length,
      courses: courses.length,
      lessons: lessons.length,
      licenses: licenses.length,
      entitlements: entitlements.length,
      devices: devices.length,
      progress: progress.length,
      securityEvents: securityEvents.length,
    },
    users,
    courses,
    lessons,
    licenses,
    entitlements,
    devices,
    progress,
    securityEvents,
  };

  const file = path.join(dir, `backup-${stamp}.json`);
  await writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Backup written: ${file}`);
  console.log(payload.counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
