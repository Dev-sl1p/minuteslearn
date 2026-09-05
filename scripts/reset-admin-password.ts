/**
 * Rotate the admin password to a random value (bcrypt cost 12).
 * Does not touch lesson videos.
 *
 * Usage:
 *   npx tsx scripts/reset-admin-password.ts
 *   ResetAdminPassword.exe  (double-click)
 */
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL?.trim() || "admin@minutessharing.com";

async function main() {
  const password = `Ml-${randomBytes(9).toString("base64url")}`;
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, role: "ADMIN" },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  console.log("");
  console.log("========================================");
  console.log("  สุ่มรหัสแอดมินใหม่แล้ว");
  console.log("========================================");
  console.log(`  อีเมล : ${admin.email}`);
  console.log(`  รหัส  : ${password}`);
  console.log("========================================");
  console.log("  จดรหัสนี้ไว้เลย — ระบบเก็บแค่ hash");
  console.log("  เข้าได้ที่ /admin/login");
  console.log("========================================");
  console.log("");
}

main()
  .catch((e) => {
    console.error("ตั้งรหัสไม่สำเร็จ:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
