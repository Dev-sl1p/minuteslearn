import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Public sample HLS streams (free / for demo only) */
const SAMPLE_VIDEOS = {
  bunny: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  tears:
    "https://test-streams.mux.dev/test_001/stream.m3u8",
  sintel: "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
  apple:
    "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8",
} as const;

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Demo seeding is disabled in production");
  }
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error("Set SEED_ADMIN_PASSWORD (at least 12 characters) before seeding");
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@minutessharing.com" },
    update: {},
    create: {
      email: "admin@minutessharing.com",
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  const learner = await prisma.user.upsert({
    where: { email: "learner@example.com" },
    update: {},
    create: {
      email: "learner@example.com",
      name: "Demo Learner",
      role: "USER",
      passwordHash,
    },
  });

  const course = await prisma.course.upsert({
    where: { slug: "game-tilt-course" },
    update: {
      wooSku: "game-tilt-course",
      wooProductId: "1001",
      published: true,
      description:
        "คอร์สวิดีโอสอนจัดการอารมณ์ตอนเล่นเกม — ตัวอย่างใช้คลิปสาธารณะ (Big Buck Bunny / Sintel)",
    },
    create: {
      title: "Course เล่นเกมยังไงให้ไม่หัวร้อน By เด็กกำมือ",
      slug: "game-tilt-course",
      description:
        "คอร์สวิดีโอสอนจัดการอารมณ์ตอนเล่นเกม — ซื้อคีย์ที่ minutessharing.com แล้ว redeem ที่นี่",
      wooSku: "game-tilt-course",
      wooProductId: "1001",
      published: true,
    },
  });

  const gameLessons = [
    {
      slug: "intro",
      title: "แนะนำคอร์ส",
      order: 1,
      description: "ภาพรวมและการใช้งานระบบเรียน (ตัวอย่าง: Big Buck Bunny)",
      streamAssetId: SAMPLE_VIDEOS.bunny,
      durationSec: 596,
    },
    {
      slug: "triggers",
      title: "รู้ทัน trigger ตอนหัวร้อน",
      order: 2,
      description: "สังเกตสัญญาณก่อนเสียอารมณ์ (ตัวอย่าง: Sintel)",
      streamAssetId: SAMPLE_VIDEOS.sintel,
      durationSec: 888,
    },
    {
      slug: "reset",
      title: "เทคนิครีเซ็ตกลางแมตช์",
      order: 3,
      description: "วิธีพักสมองแล้วกลับมาโฟกัส (ตัวอย่าง: Apple HLS demo)",
      streamAssetId: SAMPLE_VIDEOS.apple,
      durationSec: 600,
    },
  ] as const;

  for (const lesson of gameLessons) {
    await prisma.lesson.upsert({
      where: {
        courseId_slug: { courseId: course.id, slug: lesson.slug },
      },
      update: {
        title: lesson.title,
        description: lesson.description,
        order: lesson.order,
        streamAssetId: lesson.streamAssetId,
        durationSec: lesson.durationSec,
      },
      create: {
        courseId: course.id,
        ...lesson,
      },
    });
  }

  const template = await prisma.course.upsert({
    where: { slug: "davinci-template" },
    update: {
      wooSku: "davinci-template",
      wooProductId: "1002",
      published: true,
      description: "เทมเพลต DaVinci — วิดีโอตัวอย่าง Tears of Steel (HLS)",
    },
    create: {
      title: "Template Davinci",
      slug: "davinci-template",
      description: "เทมเพลต DaVinci — แมปกับสินค้า WooCommerce",
      wooSku: "davinci-template",
      wooProductId: "1002",
      published: true,
    },
  });

  await prisma.lesson.upsert({
    where: {
      courseId_slug: { courseId: template.id, slug: "install" },
    },
    update: {
      title: "ติดตั้งเทมเพลต",
      description: "ตัวอย่างวิดีโอสาธารณะสำหรับทดสอบระบบเรียน",
      order: 1,
      streamAssetId: SAMPLE_VIDEOS.tears,
      durationSec: 734,
    },
    create: {
      courseId: template.id,
      title: "ติดตั้งเทมเพลต",
      slug: "install",
      description: "ตัวอย่างวิดีโอสาธารณะสำหรับทดสอบระบบเรียน",
      order: 1,
      streamAssetId: SAMPLE_VIDEOS.tears,
      durationSec: 734,
    },
  });

  console.log("Seeded users:", { admin: admin.email, learner: learner.email });
  console.log("Seeded courses with sample videos:", {
    course: course.slug,
    template: template.slug,
    videos: SAMPLE_VIDEOS,
  });
  console.log("Demo license keys: DEMO-COURSE-001, DEMO-COURSE-002");
  console.log("Demo accounts created. Passwords are not printed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
