import type { Migration } from "@kysely/kysely/migration";
import * as m001 from "./001_initial_schema.ts";
import * as m002 from "./002_gamification.ts";

/**
 * The migration set, explicitly listed.
 *
 * Kysely's FileMigrationProvider resolves each file with a bare dynamic import, which
 * under Deno is interpreted relative to the *provider's* module URL on jsr.io rather
 * than this project — so it can't load local files. Listing them here is a static
 * import graph anyway: it survives `deno compile`, works in the container without the
 * source tree, and makes a missing migration a type error instead of a runtime one.
 *
 * Keys are the migration names Kysely records; keep them sortable and never rename
 * one that has been applied anywhere.
 */
export const migrations: Record<string, Migration> = {
  "001_initial_schema": m001,
  "002_gamification": m002,
};
