import type { Kysely } from "@kysely/kysely";

/**
 * Where a subject could go besides a session, and whether its blog exists:
 * three judgement calls (bloggable, LinkedIn-worthy, sessionable), whether a
 * blog was written, and who is on that blog. The flags are 0/1; the author is
 * a person, and deleting that person just leaves the blog unassigned.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  for (const flag of FLAGS) {
    await db.schema
      .alterTable("subjects")
      .addColumn(flag, "integer", (c) => c.notNull().defaultTo(0))
      .execute();
  }
  await db.schema
    .alterTable("subjects")
    .addColumn(
      "blog_author_id",
      "integer",
      (c) => c.references("people.id").onDelete("set null"),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const column of ["blog_author_id", ...FLAGS]) {
    await db.schema.alterTable("subjects").dropColumn(column).execute();
  }
}

const FLAGS = ["bloggable", "linkedin_worthy", "sessionable", "blog_written"];
