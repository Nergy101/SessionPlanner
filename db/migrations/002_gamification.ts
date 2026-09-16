import { type Kysely, sql } from "@kysely/kysely";

/**
 * Adds the two things gamification needs that the schema didn't already carry:
 * a bounty on a subject, and tech-area tags for the coverage radar.
 *
 * Everything else — XP, the leaderboard, seasons, the trophy, roulette candidates —
 * is derived from data that already exists. Storing scores would mean a second source
 * of truth that can drift from the subjects and sessions they're computed from.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("subjects")
    .addColumn("bounty", "integer", (c) => c.notNull().defaultTo(0))
    .execute();

  await db.schema
    .createTable("subject_tags")
    .addColumn(
      "subject_id",
      "integer",
      (c) => c.notNull().references("subjects.id").onDelete("cascade"),
    )
    .addColumn("tag", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("subject_tags_pk", ["subject_id", "tag"])
    .execute();

  await db.schema
    .createIndex("subject_tags_tag")
    .on("subject_tags")
    .column("tag")
    .execute();

  await sql`select 1`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("subject_tags").execute();
  await db.schema.alterTable("subjects").dropColumn("bounty").execute();
}
