import { assertEquals, assertRejects } from "@std/assert";

const dbPath = await Deno.makeTempFile({ suffix: ".db" });
Deno.env.set("DB_PATH", dbPath);

const { db } = await import("@/db/db.ts");
const { Migrator } = await import("@kysely/kysely/migration");
const { migrations } = await import("@/db/migrations/index.ts");
const { exportData, importData } = await import("@/services/backup.ts");

const migrator = new Migrator({
  db,
  provider: { getMigrations: () => Promise.resolve(migrations) },
});
const { error } = await migrator.migrateToLatest();
if (error) throw error;

Deno.test("data export can restore the complete database", async () => {
  await db.deleteFrom("subject_tags").execute();
  await db.deleteFrom("subject_people").execute();
  await db.deleteFrom("subject_links").execute();
  await db.deleteFrom("subjects").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("people").execute();

  await db.insertInto("people").values({
    id: 7,
    name: "Ada Lovelace",
    created_at: "2026-01-01 10:00:00",
  }).execute();
  await db.insertInto("sessions").values({
    id: 8,
    date: "2026-10-01",
    notes: "Bring diagrams",
    created_at: "2026-01-02 10:00:00",
  }).execute();
  await db.insertInto("subjects").values({
    id: 9,
    title: "Cloud deployment",
    description: "A complete backup test",
    status: 3,
    session_id: 8,
    slides_url: "https://slides.example/cloud",
    recording_url: "https://video.example/cloud",
    recap_notes: "It worked",
    bounty: 12,
    created_at: "2026-01-03 10:00:00",
    updated_at: "2026-01-04 10:00:00",
  }).execute();
  await db.insertInto("subject_links").values({
    id: 10,
    subject_id: 9,
    url: "https://example.com",
    label: "Reference",
  }).execute();
  await db.insertInto("subject_people").values({
    subject_id: 9,
    person_id: 7,
  }).execute();
  await db.insertInto("subject_tags").values({
    subject_id: 9,
    tag: "cloud",
  }).execute();

  const backup = await exportData();
  await db.deleteFrom("subject_tags").execute();
  await db.deleteFrom("subject_people").execute();
  await db.deleteFrom("subject_links").execute();
  await db.deleteFrom("subjects").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("people").execute();

  await importData(backup);

  assertEquals((await exportData()).tables, backup.tables);
});

Deno.test("invalid backups are rejected before changing data", async () => {
  const before = await exportData();
  await assertRejects(
    () => importData({ version: 999 }),
    Error,
    "Unsupported backup version",
  );
  assertEquals((await exportData()).tables, before.tables);
});
