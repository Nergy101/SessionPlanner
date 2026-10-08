import { assertEquals, assertExists } from "@std/assert";

const dbPath = await Deno.makeTempFile({ suffix: ".db" });
Deno.env.set("DB_PATH", dbPath);

// Dynamic imports on purpose: DB_PATH must be set before db.ts loads.
const { db } = await import("@/db/db.ts");
const { Migrator } = await import("@kysely/kysely/migration");
const { migrations } = await import("@/db/migrations/index.ts");
const { addNote, deleteNote, listNotes, updateNote } = await import(
  "@/services/notes.ts"
);

const migrator = new Migrator({
  db,
  provider: { getMigrations: () => Promise.resolve(migrations) },
});
const { error } = await migrator.migrateToLatest();
if (error) throw error;

Deno.test("a note keeps its line breaks, but its ends are trimmed", async () => {
  await db.deleteFrom("notes").execute();

  const note = await addNote("  first line\r\nsecond line  \n");
  assertExists(note);
  assertEquals(note.body, "first line\nsecond line");
});

Deno.test("a blank note is never stored", async () => {
  await db.deleteFrom("notes").execute();

  assertEquals(await addNote("   \r\n  "), null);
  assertEquals(await listNotes(), []);
});

Deno.test("clearing a note keeps its text; only delete removes it", async () => {
  await db.deleteFrom("notes").execute();
  const note = await addNote("keep me");
  assertExists(note);

  await updateNote(note.id, "  \n ");
  assertEquals((await listNotes()).map((n) => n.body), ["keep me"]);

  await updateNote(note.id, "changed");
  assertEquals((await listNotes()).map((n) => n.body), ["changed"]);

  await deleteNote(note.id);
  assertEquals(await listNotes(), []);
});

Deno.test("the newest note is listed first", async () => {
  await db.deleteFrom("notes").execute();
  await addNote("older");
  await addNote("newer");

  assertEquals((await listNotes()).map((n) => n.body), ["newer", "older"]);
});
