import {
  CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  Kysely,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "@kysely/kysely";
import { DatabaseSync } from "node:sqlite";

/** Statements that produce result rows rather than just a change count. */
function returnsRows(sql: string): boolean {
  return /^\s*(select|with|pragma)/i.test(sql) || /\breturning\b/i.test(sql);
}

/**
 * A Kysely dialect over `node:sqlite`, the SQLite that ships inside Deno.
 *
 * Kysely publishes dialects for better-sqlite3, bun:sqlite and libsql, but not for
 * the built-in module — and that module is the only one here that needs no native
 * addon, no FFI permission and no third-party package. The whole adapter is this file.
 *
 * SQLite is synchronous, so the async DatabaseConnection contract is satisfied by
 * running the statement inline and resolving. Writes are serialised by the single
 * connection, which is what we want for a one-writer app.
 */
class NodeSqliteConnection implements DatabaseConnection {
  constructor(readonly db: DatabaseSync) {}

  executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    const stmt = this.db.prepare(compiled.sql);
    const params = compiled.parameters as unknown[];

    // Route by whether the statement yields rows. `run()` reports changes and the
    // last insert id but throws away any rows, so an INSERT/UPDATE/DELETE carrying
    // a RETURNING clause has to go through `all()` as well — otherwise Kysely's
    // `returning(...)` silently comes back empty.
    if (returnsRows(compiled.sql)) {
      return Promise.resolve({ rows: stmt.all(...params as never[]) as R[] });
    }

    const result = stmt.run(...params as never[]);
    return Promise.resolve({
      rows: [],
      numAffectedRows: BigInt(result.changes),
      insertId: result.lastInsertRowid === undefined
        ? undefined
        : BigInt(result.lastInsertRowid),
    });
  }

  // deno-lint-ignore require-yield
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("Streaming is not supported by node:sqlite.");
  }
}

class NodeSqliteDriver implements Driver {
  #db?: DatabaseSync;
  #connection?: NodeSqliteConnection;

  constructor(private readonly path: string) {}

  init(): Promise<void> {
    this.#db = new DatabaseSync(this.path);

    // WAL survives a crash better and lets a reader run during a write.
    this.#db.exec("PRAGMA journal_mode = WAL");
    // Without this, SQLite silently ignores every FK constraint we declared.
    this.#db.exec("PRAGMA foreign_keys = ON");
    // Wait rather than fail if the file is briefly locked.
    this.#db.exec("PRAGMA busy_timeout = 5000");

    this.#connection = new NodeSqliteConnection(this.#db);
    return Promise.resolve();
  }

  acquireConnection(): Promise<DatabaseConnection> {
    return Promise.resolve(this.#connection!);
  }

  async beginTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("BEGIN"));
  }

  async commitTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("COMMIT"));
  }

  async rollbackTransaction(conn: DatabaseConnection): Promise<void> {
    await conn.executeQuery(CompiledQuery.raw("ROLLBACK"));
  }

  releaseConnection(): Promise<void> {
    return Promise.resolve();
  }

  destroy(): Promise<void> {
    this.#db?.close();
    return Promise.resolve();
  }
}

export class NodeSqliteDialect implements Dialect {
  constructor(private readonly path: string) {}

  createDriver(): Driver {
    return new NodeSqliteDriver(this.path);
  }
  createAdapter(): SqliteAdapter {
    return new SqliteAdapter();
  }
  createQueryCompiler(): SqliteQueryCompiler {
    return new SqliteQueryCompiler();
  }
  createIntrospector(db: Kysely<unknown>): SqliteIntrospector {
    return new SqliteIntrospector(db);
  }
}
