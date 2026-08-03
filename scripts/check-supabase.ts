import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [users, courses, lessons, licenses, progress, devices] =
    await Promise.all([
      prisma.user.count(),
      prisma.course.count(),
      prisma.lesson.count(),
      prisma.license.count(),
      prisma.lessonProgress.count(),
      prisma.device.count(),
    ]);

  console.log(
    JSON.stringify(
      {
        connected: true,
        counts: { users, courses, lessons, licenses, progress, devices },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ connected: false, error: String(e.message) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
