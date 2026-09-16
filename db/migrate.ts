import { type MigrationResult, Migrator } from "@kysely/kysely/migration";
import { createDb, DB_PATH } from "./db.ts";
import { migrations } from "./migrations/index.ts";

/**
 * The migration runner behind `deno task dbup` / `dbdown` / `dbstatus`.
 *
 * Kysely's Migrator keeps its own `kysely_migration` bookkeeping table and applies
 * each migration in a transaction, so a failure halfway leaves nothing half-built.
 */
function migrator(db: ReturnType<typeof createDb>) {
  return new Migrator({
    db,
    // A static provider rather than FileMigrationProvider: see migrations/index.ts.
    provider: { getMigrations: () => Promise.resolve(migrations) },
  });
}

function report(
  results: MigrationResult[] | undefined,
  error: unknown,
  verb: string,
) {
  for (const r of results ?? []) {
    const mark = r.status === "Success"
      ? "✔"
      : r.status === "Error"
      ? "✘"
      : "·";
    console.log(`  ${mark} ${verb} ${r.migrationName}`);
  }

  if (error) {
    console.error(
      `\nMigration failed: ${error instanceof Error ? error.message : error}`,
    );
    Deno.exit(1);
  }

  if (!results?.length) console.log("  (nothing to do)");
}

const command = Deno.args[0] ?? "up";
const db = createDb();
const m = migrator(db);

console.log(`${DB_PATH}\n`);

switch (command) {
  case "up": {
    const { error, results } = await m.migrateToLatest();
    report(results, error, "applied");
    break;
  }
  case "down": {
    const { error, results } = await m.migrateDown();
    report(results, error, "reverted");
    break;
  }
  case "redo": {
    // Handy in development: roll the last one back and re-apply it.
    const downed = await m.migrateDown();
    report(downed.results, downed.error, "reverted");
    const upped = await m.migrateToLatest();
    report(upped.results, upped.error, "applied");
    break;
  }
  case "status": {
    const all = await m.getMigrations();
    for (const mig of all) {
      console.log(
        `  ${mig.executedAt ? "✔ applied" : "· pending"}  ${mig.name}`,
      );
    }
    if (!all.length) console.log("  (no migration files)");
    break;
  }
  default:
    console.error(
      `Unknown command "${command}". Use up | down | redo | status.`,
    );
    Deno.exit(1);
}

await db.destroy();
