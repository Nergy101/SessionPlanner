import { assert, assertEquals } from "@std/assert";

/**
 * Integration tests against a real SQLite file, migrated with the app's own
 * migrations — so the NOCASE collation and ON DELETE SET NULL behaviour under test
 * are the ones that actually ship.
 *
 * DB_PATH has to be set before importing db.ts, which opens its connection at module
 * load, so these use a dynamic import after setting it.
 */
const dbPath = await Deno.makeTempFile({ suffix: ".db" });
Deno.env.set("DB_PATH", dbPath);

const { db } = await import("@/db/db.ts");
const { Migrator } = await import("@kysely/kysely/migration");
const { migrations } = await import("@/db/migrations/index.ts");

const migrator = new Migrator({
  db,
  provider: { getMigrations: () => Promise.resolve(migrations) },
});
const { error } = await migrator.migrateToLatest();
if (error) throw error;

const subjects = await import("@/services/subjects.ts");
const people = await import("@/services/people.ts");
const sessions = await import("@/services/sessions.ts");
type SortKey = import("@/services/subjects.ts").SortKey;
type SortDir = import("@/services/subjects.ts").SortDir;

/** Empty every table so each test starts from a known state. */
async function reset() {
  await db.deleteFrom("subject_people").execute();
  await db.deleteFrom("subject_links").execute();
  await db.deleteFrom("subjects").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("people").execute();
}

const test = (name: string, fn: () => Promise<void>) =>
  Deno.test(name, async () => {
    await reset();
    await fn();
  });

// ---------------------------------------------------------------------------
// The ladder, end to end through the database
// ---------------------------------------------------------------------------

test("a new subject starts as an idea", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  assertEquals((await subjects.getSubject(id))!.status, "idea");
});

test("the first speaker promotes idea to assigned", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  assertEquals((await subjects.getSubject(id))!.status, "assigned");
});

test("removing the last speaker demotes back to idea", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  await subjects.setSubjectPeople(id, []);
  assertEquals((await subjects.getSubject(id))!.status, "idea");
});

test("assigning a session sets planned, unassigning falls back", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  const sessionId = await sessions.createSession("2026-10-01");

  await subjects.setSubjectSession(id, sessionId);
  assertEquals((await subjects.getSubject(id))!.status, "planned");

  await subjects.setSubjectSession(id, null);
  assertEquals((await subjects.getSubject(id))!.status, "assigned");
});

test("a subject with no speaker can still be planned", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  const sessionId = await sessions.createSession("2026-10-01");
  await subjects.setSubjectSession(id, sessionId);

  const s = (await subjects.getSubject(id))!;
  assertEquals(s.status, "planned");
  assertEquals(s.people.length, 0);
});

test("presented and archived survive every people and date change", async () => {
  for (const sticky of ["presented", "archived"] as const) {
    await reset();
    const id = await subjects.createSubject("Testcontainers in CI");
    await subjects.setSubjectPeople(id, ["Jan de Vries"]);
    await subjects.setSubjectStatus(id, sticky);

    const sessionId = await sessions.createSession("2026-10-01");
    await subjects.setSubjectSession(id, sessionId);
    await subjects.setSubjectPeople(id, []);
    await subjects.setSubjectSession(id, null);

    assertEquals((await subjects.getSubject(id))!.status, sticky);
  }
});

test("leaving a sticky state hands control back to the ladder", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  await subjects.setSubjectStatus(id, "presented");

  // Asking for idea on something that has a speaker gets assigned — the ladder wins.
  await subjects.setSubjectStatus(id, "idea");
  assertEquals((await subjects.getSubject(id))!.status, "assigned");
});

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

test("get-or-create resolves casing and spacing to one person", async () => {
  const a = await people.getOrCreatePerson("Jan de Vries");
  for (
    const variant of ["jan de vries", "JAN DE VRIES", "  Jan   de Vries  "]
  ) {
    assertEquals((await people.getOrCreatePerson(variant)).id, a.id);
  }
  assertEquals((await people.listPeople()).length, 1);
});

test("setting the same person twice on a subject stores them once", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries", "jan de vries"]);
  assertEquals((await subjects.getSubject(id))!.people.length, 1);
});

test("merge moves subjects across and removes the source", async () => {
  const one = await subjects.createSubject("Testcontainers in CI");
  const two = await subjects.createSubject("OpenTelemetry end to end");
  await subjects.setSubjectPeople(one, ["Jan"]);
  await subjects.setSubjectPeople(two, ["Jan de Vries"]);

  const all = await people.listPeople();
  const source = all.find((p) => p.name === "Jan")!;
  const target = all.find((p) => p.name === "Jan de Vries")!;
  await people.mergePeople(source.id, target.id);

  const remaining = await people.listPeople();
  assertEquals(remaining.length, 1);
  assertEquals(remaining[0].name, "Jan de Vries");
  assertEquals(
    (await subjects.getSubject(one))!.people[0].name,
    "Jan de Vries",
  );
  assertEquals(
    (await subjects.getSubject(two))!.people[0].name,
    "Jan de Vries",
  );
});

test("merge does not duplicate a subject both were already on", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan", "Jan de Vries"]);

  const all = await people.listPeople();
  const source = all.find((p) => p.name === "Jan")!;
  const target = all.find((p) => p.name === "Jan de Vries")!;
  await people.mergePeople(source.id, target.id);

  assertEquals((await people.listPeople()).length, 1);
  assertEquals((await subjects.getSubject(id))!.people.length, 1);
});

test("delete refuses while the person is still on a subject", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  const person = (await people.listPeople())[0];

  await people.deletePerson(person.id);
  assertEquals((await people.listPeople()).length, 1);
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

test("deleting a session unschedules its subjects rather than deleting them", async () => {
  const withSpeaker = await subjects.createSubject("Testcontainers in CI");
  const without = await subjects.createSubject("OpenTelemetry end to end");
  await subjects.setSubjectPeople(withSpeaker, ["Jan de Vries"]);

  const sessionId = await sessions.createSession("2026-10-01");
  await subjects.setSubjectSession(withSpeaker, sessionId);
  await subjects.setSubjectSession(without, sessionId);

  await sessions.deleteSession(sessionId);

  const a = (await subjects.getSubject(withSpeaker))!;
  const b = (await subjects.getSubject(without))!;
  assertEquals(a.sessionId, null);
  assertEquals(b.sessionId, null);
  assertEquals(a.status, "assigned"); // still has a speaker
  assertEquals(b.status, "idea"); // does not
});

test("mark all presented only touches the planned ones", async () => {
  const planned = await subjects.createSubject("Testcontainers in CI");
  const archived = await subjects.createSubject("OpenTelemetry end to end");
  const sessionId = await sessions.createSession("2026-10-01");

  await subjects.setSubjectSession(planned, sessionId);
  await subjects.setSubjectSession(archived, sessionId);
  await subjects.setSubjectStatus(archived, "archived");

  assertEquals(await sessions.markAllPresented(sessionId), 1);
  assertEquals((await subjects.getSubject(planned))!.status, "presented");
  assertEquals((await subjects.getSubject(archived))!.status, "archived");
});

test("upcoming sessions are the soonest ones not in the past, in order", async () => {
  const t = sessions.today();
  const shift = (days: number) => {
    const d = new Date(`${t}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  await sessions.createSession(shift(-7));
  const later = await sessions.createSession(shift(30));
  const soon = await sessions.createSession(shift(3));
  const today = await sessions.createSession(shift(0));
  await sessions.createSession(shift(60));

  assertEquals((await sessions.getNextSession())!.id, today);
  assertEquals(
    (await sessions.getUpcomingSessions(3)).map((s) => s.id),
    [today, soon, later],
  );
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

test("archived subjects stay out of the default list but are reachable", async () => {
  const kept = await subjects.createSubject("Testcontainers in CI");
  const archived = await subjects.createSubject("OpenTelemetry end to end");
  await subjects.setSubjectStatus(archived, "archived");

  const listed = await subjects.listSubjects();
  assertEquals(listed.length, 1);
  assertEquals(listed[0].id, kept);

  const filtered = await subjects.listSubjects({ status: "archived" });
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].id, archived);
});

test("the schedulable pool puts assigned first and excludes the rest", async () => {
  const idea = await subjects.createSubject("Idea");
  const assigned = await subjects.createSubject("Assigned");
  const scheduled = await subjects.createSubject("Scheduled");
  const archived = await subjects.createSubject("Archived");
  const presented = await subjects.createSubject("Presented");

  await subjects.setSubjectPeople(assigned, ["Jan de Vries"]);
  const sessionId = await sessions.createSession("2026-10-01");
  await subjects.setSubjectSession(scheduled, sessionId);
  await subjects.setSubjectStatus(archived, "archived");
  await subjects.setSubjectStatus(presented, "presented");

  const pool = await subjects.listSchedulable();
  assertEquals(pool.map((s) => s.id), [assigned, idea]);
});

test("the list is ordered planned, assigned, idea, presented, archived", async () => {
  // Created in a deliberately different order from the one we expect back.
  const idea = await subjects.createSubject("An idea");
  const presented = await subjects.createSubject("Already presented");
  const planned = await subjects.createSubject("On the calendar");
  const archived = await subjects.createSubject("Shelved");
  const assigned = await subjects.createSubject("Has a speaker");

  await subjects.setSubjectPeople(assigned, ["Jan de Vries"]);
  const sessionId = await sessions.createSession("2026-10-01");
  await subjects.setSubjectSession(planned, sessionId);
  await subjects.setSubjectStatus(presented, "presented");
  await subjects.setSubjectStatus(archived, "archived");

  const listed = await subjects.listSubjects({ includeArchived: true });
  assertEquals(
    listed.map((s) => s.status),
    ["planned", "assigned", "idea", "presented", "archived"],
  );
  assertEquals(listed.map((s) => s.id), [
    planned,
    assigned,
    idea,
    presented,
    archived,
  ]);
});

test("sorting sinks missing values in both directions", async () => {
  const soon = await sessions.createSession("2030-01-01");
  const later = await sessions.createSession("2030-02-01");

  const a = await subjects.createSubject("beta", later);
  const b = await subjects.createSubject("Alpha", soon);
  const c = await subjects.createSubject("gamma");
  await subjects.setSubjectPeople(a, ["Zoe"]);
  await subjects.setSubjectPeople(b, ["Anna"]);
  await subjects.setSubjectBounty(c, 50);

  const list = await subjects.listSubjects();
  const ids = (key: SortKey, dir: SortDir) =>
    subjects.sortSubjects(list, key, dir).map((s) => s.id);

  assertEquals(ids("title", "asc"), [b, a, c]);
  assertEquals(ids("title", "desc"), [c, a, b]);
  assertEquals(ids("session", "asc"), [b, a, c]);
  assertEquals(ids("session", "desc"), [a, b, c]);
  assertEquals(ids("speakers", "desc"), [a, b, c]);
  assertEquals(ids("bounty", "desc")[0], c);
  assertEquals(ids("status", "asc")[0], c);
});

test("search matches the description as well as the title", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.updateSubjectDetails(id, {
    title: "Testcontainers in CI",
    description: "Spinning up real Postgres in the pipeline",
  });

  const found = await subjects.listSubjects({ text: "postgres" });
  assertEquals(found.length, 1);
  assertEquals(found[0].id, id);
});

test("replacing links drops the old rows and labels fall back to the host", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.replaceSubjectLinks(id, [
    { url: "https://example.com/a", label: "A" },
    { url: "   " }, // blank rows are dropped
  ]);
  assertEquals((await subjects.getSubject(id))!.links.length, 1);

  await subjects.replaceSubjectLinks(id, [{ url: "https://example.com/b" }]);
  const links = (await subjects.getSubject(id))!.links;
  assertEquals(links.length, 1);
  assertEquals(links[0].url, "https://example.com/b");
  assertEquals(subjects.linkLabel(links[0]), "example.com");
});

test("foreign keys are enforced, not silently ignored", async () => {
  // The pragma is set in the dialect; without it SQLite accepts orphan rows.
  const rows = await db.selectFrom("subjects").selectAll().execute();
  assertEquals(rows.length, 0);

  let threw = false;
  try {
    await db
      .insertInto("subject_links")
      .values({ subject_id: 9999, url: "https://example.com" })
      .execute();
  } catch {
    threw = true;
  }
  assert(threw, "inserting a link for a non-existent subject should fail");
});

// Close the shared connection so the test process can exit.
globalThis.addEventListener("unload", () => {
  db.destroy();
  try {
    Deno.removeSync(dbPath);
  } catch { /* already gone */ }
});
