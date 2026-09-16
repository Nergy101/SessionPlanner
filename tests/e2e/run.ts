/**
 * End-to-end harness.
 *
 * Builds a throwaway database in a temp directory, starts its own server on its own
 * port pointed at that file, runs the Playwright spec against it, then tears the whole
 * thing down. The real `data/session-planner.db` is never opened, never written and never
 * deleted — and the guard below makes that structural rather than a promise.
 *
 *   deno task e2e            # empty database
 *   deno task e2e --seed     # with the demo fixtures loaded
 */
import { Migrator } from "@kysely/kysely/migration";
import * as path from "@std/path";
import { createDb, isDefaultDb } from "@/db/db.ts";
import { migrations } from "@/db/migrations/index.ts";
import { seedDemoData } from "../fixtures.ts";

const PORT = Number(Deno.env.get("E2E_PORT") ?? 8787);
const SEED = Deno.args.includes("--seed");
const SPEC = path.join(import.meta.dirname!, "spec.mjs");

const tmpDir = await Deno.makeTempDir({ prefix: "sp-e2e-" });
const dbPath = path.join(tmpDir, "e2e.db");

// Belt and braces: refuse to run if anything has pointed us at the real database.
if (isDefaultDb(dbPath)) {
  console.error("Refusing to run e2e against the real database.");
  Deno.exit(1);
}

console.log(`e2e database: ${dbPath}`);

// ---- build the throwaway database ---------------------------------------
{
  const db = createDb(dbPath);
  const { error } = await new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(migrations) },
  }).migrateToLatest();
  if (error) throw error;

  if (SEED) {
    await seedDemoData(db);
    console.log("seeded demo fixtures");
  }
  await db.destroy();
}

// ---- start a server of our own ------------------------------------------
const server = new Deno.Command("deno", {
  args: ["run", "-A", "npm:vite", "--port", String(PORT), "--strictPort"],
  env: {
    ...Deno.env.toObject(),
    DB_PATH: dbPath,
    APP_PASSWORD: "e2e-password",
    E2E_BASE: `http://127.0.0.1:${PORT}`,
  },
  stdout: "piped",
  stderr: "piped",
}).spawn();

const base = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/login`);
      await res.body?.cancel();
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

let code = 1;
try {
  if (!await waitForServer()) {
    console.error(`Server never came up on ${base}.`);
    Deno.exit(1);
  }

  const spec = new Deno.Command("node", {
    args: [SPEC],
    env: {
      ...Deno.env.toObject(),
      E2E_BASE: base,
      E2E_PASSWORD: "e2e-password",
      E2E_OUT: tmpDir,
      // Playwright is not a dependency of this project; the spec resolves it from here.
      PLAYWRIGHT_BASE: Deno.env.get("PLAYWRIGHT_BASE") ??
        path.join(Deno.env.get("HOME") ?? "", "repos", "sprintendo"),
    },
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();

  code = (await spec.status).code;
  console.log(`\nscreenshots: ${tmpDir}`);
} finally {
  server.kill("SIGTERM");
  await server.status.catch(() => {});
  // Keep the directory when something failed, so the screenshots survive.
  if (code === 0) {
    await Deno.remove(tmpDir, { recursive: true }).catch(() => {});
  }
}

Deno.exit(code);
