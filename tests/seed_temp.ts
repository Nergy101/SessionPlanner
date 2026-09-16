/**
 * Seeds demo data into a throwaway database, for visual checks.
 *
 * Refuses to run against the default path, so `deno task demo` can never bury the
 * real local data under invented topics.
 */
import { Migrator } from "@kysely/kysely/migration";
import { createDb, isDefaultDb } from "@/db/db.ts";
import { migrations } from "@/db/migrations/index.ts";
import { seedDemoData } from "./fixtures.ts";

const path = Deno.env.get("DB_PATH");

// isDefaultDb resolves both sides, so a relative path pointing at the real file is
// caught too — a plain string compare against "data/session-planner.db" was not.
if (!path || isDefaultDb(path)) {
  console.error(
    "Refusing to seed the real database. Set DB_PATH to a throwaway file first,\n" +
      "or use `deno task demo`, which makes one for you.",
  );
  Deno.exit(1);
}

const db = createDb(path);

const { error } = await new Migrator({
  db,
  provider: { getMigrations: () => Promise.resolve(migrations) },
}).migrateToLatest();
if (error) throw error;

await seedDemoData(db);
await db.destroy();

console.log(`Seeded demo data into ${path}`);
