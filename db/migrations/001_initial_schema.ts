import { type Kysely, sql } from "@kysely/kysely";

/**
 * Every migration exports up() and down(). `deno task dbup` applies the pending
 * ones; `deno task dbdown` rolls the most recent one back.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("people")
    .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
    // NOCASE makes the unique index case-insensitive, so a typo in capitalisation
    // can never create a second row for the same colleague.
    .addColumn(
      "name",
      "text",
      (c) => c.notNull().modifyEnd(sql`collate nocase`),
    )
    .addColumn(
      "created_at",
      "text",
      (c) => c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  await db.schema
    .createIndex("people_name_unique")
    .on("people")
    .column("name")
    .unique()
    .execute();

  await db.schema
    .createTable("sessions")
    .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
    .addColumn("date", "text", (c) => c.notNull())
    .addColumn("notes", "text")
    .addColumn(
      "created_at",
      "text",
      (c) => c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  await db.schema.createIndex("sessions_date").on("sessions").column("date")
    .execute();

  await db.schema
    .createTable("subjects")
    .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
    .addColumn("title", "text", (c) => c.notNull())
    .addColumn("description", "text")
    .addColumn("status", "integer", (c) => c.notNull().defaultTo(0))
    // Deleting a session unschedules its subjects rather than destroying them.
    .addColumn(
      "session_id",
      "integer",
      (c) => c.references("sessions.id").onDelete("set null"),
    )
    .addColumn("slides_url", "text")
    .addColumn("recording_url", "text")
    .addColumn("recap_notes", "text")
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

  await db.schema.createIndex("subjects_status").on("subjects").column("status")
    .execute();
  await db.schema.createIndex("subjects_session_id").on("subjects").column(
    "session_id",
  ).execute();

  await db.schema
    .createTable("subject_links")
    .addColumn("id", "integer", (c) => c.primaryKey().autoIncrement())
    .addColumn(
      "subject_id",
      "integer",
      (c) => c.notNull().references("subjects.id").onDelete("cascade"),
    )
    .addColumn("url", "text", (c) => c.notNull())
    .addColumn("label", "text")
    .execute();

  await db.schema
    .createIndex("subject_links_subject_id")
    .on("subject_links")
    .column("subject_id")
    .execute();

  await db.schema
    .createTable("subject_people")
    .addColumn(
      "subject_id",
      "integer",
      (c) => c.notNull().references("subjects.id").onDelete("cascade"),
    )
    .addColumn(
      "person_id",
      "integer",
      (c) => c.notNull().references("people.id").onDelete("cascade"),
    )
    .addPrimaryKeyConstraint("subject_people_pk", ["subject_id", "person_id"])
    .execute();

  await db.schema
    .createIndex("subject_people_person_id")
    .on("subject_people")
    .column("person_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Children before parents, so the foreign keys never block a drop.
  await db.schema.dropTable("subject_people").execute();
  await db.schema.dropTable("subject_links").execute();
  await db.schema.dropTable("subjects").execute();
  await db.schema.dropTable("sessions").execute();
  await db.schema.dropTable("people").execute();
}
