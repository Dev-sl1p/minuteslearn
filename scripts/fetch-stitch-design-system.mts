/**
 * Fetch Stitch design systems for the MinutesLearn project.
 * Usage: node --import tsx scripts/fetch-stitch-design-system.mts
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { stitch } from "@google/stitch-sdk";

const PROJECT_ID = "13997080319821954713";

function loadEnvKey() {
  if (process.env.STITCH_API_KEY) return;
  const envPath = join(process.cwd(), ".env");
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
  throw new Error("STITCH_API_KEY missing");
}

function pick(obj: unknown, depth = 0): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (depth > 6) return "[truncated]";
  if (Array.isArray(obj)) return obj.map((x) => pick(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "function") continue;
    if (k === "root" || k === "parent" || k === "_client") continue;
    try {
      out[k] = pick(v, depth + 1);
    } catch {
      out[k] = String(v);
    }
  }
  return out;
}

async function main() {
  loadEnvKey();
  const dir = join(
    process.cwd(),
    "design-stich",
    "stitch_secure_online_learning_portal",
    "academic_authority_redux",
  );
  mkdirSync(dir, { recursive: true });

  const project = stitch.project(PROJECT_ID);
  const systems = await project.listDesignSystems();
  console.log(`systems: ${systems.length}`);

  const summary = systems.map((ds, i) => {
    const any = ds as unknown as Record<string, unknown>;
    return {
      index: i,
      id: any.id ?? any.designSystemId ?? null,
      name: any.name ?? null,
      keys: Object.keys(any),
    };
  });
  writeFileSync(join(dir, "design-systems-index.json"), JSON.stringify(summary, null, 2));
  console.log("wrote design-systems-index.json");

  for (let i = 0; i < systems.length; i++) {
    const ds = systems[i] as unknown as Record<string, unknown> & {
      getMarkdown?: () => Promise<string>;
      markdown?: string;
      designMd?: string;
    };
    const safe = pick(ds);
    writeFileSync(
      join(dir, `design-system-${i}.json`),
      JSON.stringify(safe, null, 2),
    );
    console.log(`wrote design-system-${i}.json`);

    // Prefer markdown if available on the object
    for (const key of ["markdown", "designMd", "designMarkdown", "md"] as const) {
      if (typeof ds[key] === "string" && (ds[key] as string).length > 20) {
        writeFileSync(join(dir, `DESIGN-${i}.md`), ds[key] as string);
        console.log(`wrote DESIGN-${i}.md from .${key}`);
      }
    }

    if (typeof ds.getMarkdown === "function") {
      try {
        const md = await ds.getMarkdown();
        writeFileSync(join(dir, `DESIGN-${i}.md`), md);
        console.log(`wrote DESIGN-${i}.md via getMarkdown()`);
      } catch (e) {
        console.warn(`getMarkdown failed:`, (e as Error).message);
      }
    }
  }

  // Keep existing DESIGN.md if present; otherwise copy first markdown
  if (!existsSync(join(dir, "DESIGN.md"))) {
    for (let i = 0; i < systems.length; i++) {
      const p = join(dir, `DESIGN-${i}.md`);
      if (existsSync(p)) {
        writeFileSync(join(dir, "DESIGN.md"), readFileSync(p));
        console.log(`copied DESIGN-${i}.md -> DESIGN.md`);
        break;
      }
    }
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
