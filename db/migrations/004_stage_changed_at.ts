import { type Kysely, sql } from "@kysely/kysely";

/**
 * Stage (idea / speaker / planned / presented) is derived on every read from
 * whether a subject has a speaker and whether it sits on a past or future
 * session — see deriveStage in services/subjects.ts. Nothing about the stage
 * itself is stored.
 *
 * This column tracks *when* that derived stage last changed, so idle time can
 * be shown without a second source of truth for the stage. Backfilled from
 * created_at: a subject that has never moved falls back to the day it was
 * captured.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("subjects")
    .addColumn("stage_changed_at", "text")
    .execute();

  await sql`update subjects set stage_changed_at = created_at`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("subjects").dropColumn("stage_changed_at")
    .execute();
}
