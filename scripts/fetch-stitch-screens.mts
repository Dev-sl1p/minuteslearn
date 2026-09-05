/**
 * Download Stitch project screens (HTML + PNG) into design-stich/
 * Usage: node --import tsx scripts/fetch-stitch-screens.mts
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stitch } from "@google/stitch-sdk";

const PROJECT_ID = "13997080319821954713";

const SCREENS: { id: string; slug: string }[] = [
  { id: "b32cb7a7f8de4de18142beafff81ec80", slug: "minuteslearn_student_analytics" },
  { id: "22e7db2f64604862a1569276e8813b27", slug: "minuteslearn_device_management" },
  { id: "3e4c5cee09894993a8733bb48233b764", slug: "minuteslearn_course_editor" },
  { id: "044ea763b4b94bd3a50e78647b41d7d1", slug: "minuteslearn_admin_dashboard" },
  { id: "838baaf04ce648f28817f28f86cac76d", slug: "minuteslearn_video_course_player" },
  { id: "8445edc8c0284fb58e0acc2392194562", slug: "minuteslearn_my_courses_dashboard" },
  { id: "3f439b05bf4b4053b99e74546528dbeb", slug: "minuteslearn_login_license_entry" },
  {
    id: "asset-stub-assets_952faf1bfa234469b2b3e3bf1ad5206c",
    slug: "academic_authority_redux",
  },
];

function loadEnvKey() {
  if (process.env.STITCH_API_KEY) return;
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) throw new Error(".env not found");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^STITCH_API_KEY=(.*)$/);
    if (m) {
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env.STITCH_API_KEY = v;
      return;
    }
  }
  throw new Error("STITCH_API_KEY missing in .env");
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  loadEnvKey();
  const root = join(
    process.cwd(),
    "design-stich",
    "stitch_secure_online_learning_portal",
  );
  mkdirSync(root, { recursive: true });

  const project = stitch.project(PROJECT_ID);
  console.log(`Project ${PROJECT_ID}`);

  for (const item of SCREENS) {
    const dir = join(root, item.slug);
    mkdirSync(dir, { recursive: true });
    console.log(`\n=== ${item.slug} (${item.id}) ===`);

    try {
      if (item.id.startsWith("asset-stub-")) {
        try {
          const systems = await project.listDesignSystems();
          console.log(`design systems: ${systems.length}`);
          for (const ds of systems) {
            writeFileSync(
              join(dir, "design-system.json"),
              JSON.stringify(ds, null, 2),
            );
            console.log("saved design-system.json");
          }
        } catch (e) {
          console.warn("listDesignSystems failed:", (e as Error).message);
        }
      }

      const screen = await project.getScreen(item.id);
      const htmlUrl = await screen.getHtml();
      const imageUrl = await screen.getImage();

      if (htmlUrl) {
        const n = await download(String(htmlUrl), join(dir, "code.html"));
        console.log(`code.html ${n} bytes`);
      } else {
        console.warn("no HTML URL");
      }

      if (imageUrl) {
        const n = await download(String(imageUrl), join(dir, "screen.png"));
        console.log(`screen.png ${n} bytes`);
      } else {
        console.warn("no image URL");
      }
    } catch (e) {
      console.error(`FAILED ${item.slug}:`, (e as Error).message);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
