import { type Kysely, sql } from "@kysely/kysely";

/**
 * Two things the session page needs that weren't stored anywhere:
 *
 * - `sessions.start_time`: "HH:MM" in Amsterdam time, null when not decided
 *   yet. Kept apart from `date` so every existing date comparison still works.
 * - `subjects.position`: the running order within its session, 1-based. Null
 *   while unscheduled. Backfilled in id order, which is how the agenda was
 *   shown until now.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("sessions")
    .addColumn("start_time", "text")
    .execute();
  await db.schema
    .alterTable("subjects")
    .addColumn("position", "integer")
    .execute();

  await sql`
    update subjects set position = (
      select count(*) from subjects as earlier
      where earlier.session_id = subjects.session_id
        and earlier.id <= subjects.id
    )
    where session_id is not null
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("subjects").dropColumn("position").execute();
  await db.schema.alterTable("sessions").dropColumn("start_time").execute();
}
