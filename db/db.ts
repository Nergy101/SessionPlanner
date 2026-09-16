import { Kysely } from "@kysely/kysely";
import * as path from "@std/path";
import { NodeSqliteDialect } from "./node-sqlite-dialect.ts";
import type { Database } from "./schema.ts";

/** The repo root, derived from this file rather than the process's cwd. */
const PROJECT_ROOT = path.resolve(import.meta.dirname!, "..");

/**
 * The real local database.
 *
 * Anchored to the project root, NOT the current directory. A cwd-relative default
 * would silently create a second, empty database whenever the server was started
 * from anywhere else — which looks exactly like "my data disappeared".
 */
export const DEFAULT_DB_PATH = path.join(
  PROJECT_ROOT,
  "data",
  "session-planner.db",
);

/** Where this process will actually read and write. Tests and the e2e harness set DB_PATH. */
export const DB_PATH = Deno.env.get("DB_PATH") ?? DEFAULT_DB_PATH;

/**
 * True when `candidate` is the real local database rather than a throwaway.
 * Used by the seed and e2e entry points to refuse to touch your data.
 */
export function isDefaultDb(candidate: string): boolean {
  return path.resolve(candidate) === DEFAULT_DB_PATH;
}

/** Opens a connection. Callers own it; the app-wide one is `db` below. */
export function createDb(dbPath: string = DB_PATH): Kysely<Database> {
  // node:sqlite won't create intermediate directories.
  Deno.mkdirSync(path.dirname(dbPath), { recursive: true });

  return new Kysely<Database>({ dialect: new NodeSqliteDialect(dbPath) });
}

/**
 * The connection the server uses. SQLite is single-writer, and one shared
 * connection is both the fastest and the safest way to talk to it from one process.
 */
export const db: Kysely<Database> = createDb();
