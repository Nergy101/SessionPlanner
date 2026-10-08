import { type Kysely, sql } from "@kysely/kysely";

/**
 * Free-form notes. Deliberately not linked to subjects or sessions: they are
 * scratch space, so they never feed the planning data, scoring, or the dashboard.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("notes")
    .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
    .addColumn("body", "text", (c) => c.notNull())
    .addColumn(
      "created_at",
      "text",
      (c) => c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn(
      "updated_at",
      "text",
      (c) => c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("notes").execute();
}
