import { assert, assertEquals } from "@std/assert";

/**
 * Integration tests against a real SQLite file, migrated with the app's own
 * migrations, so the SQL the app runs is the SQL under test.
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
const backup = await import("@/services/backup.ts");
type SortKey = import("@/services/subjects.ts").SortKey;
type SortDir = import("@/services/subjects.ts").SortDir;
type Stage = import("@/services/subjects.ts").Stage;

/** Far enough from today that the test never drifts across the boundary. */
const FUTURE = "2099-01-01";
const PAST = "2000-01-01";

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
// Stage, derived from speakers and the session date
// ---------------------------------------------------------------------------

test("a new subject starts as an idea", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  assertEquals((await subjects.getSubject(id))!.stage, "idea");
});

test("the first speaker makes it a speaker topic", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  assertEquals((await subjects.getSubject(id))!.stage, "speaker");
});

test("removing the last speaker drops it back to idea", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  await subjects.setSubjectPeople(id, []);
  assertEquals((await subjects.getSubject(id))!.stage, "idea");
});

test("a session in the future makes it planned, speaker or not", async () => {
  const withSpeaker = await subjects.createSubject("Testcontainers in CI");
  const without = await subjects.createSubject("OpenTelemetry end to end");
  await subjects.setSubjectPeople(withSpeaker, ["Jan de Vries"]);
  const sessionId = await sessions.createSession(FUTURE);

  await subjects.setSubjectSession(withSpeaker, sessionId);
  await subjects.setSubjectSession(without, sessionId);

  assertEquals((await subjects.getSubject(withSpeaker))!.stage, "planned");
  assertEquals((await subjects.getSubject(without))!.stage, "planned");
});

test("a session in the past makes it presented, and it stays so", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  const sessionId = await sessions.createSession(PAST);
  await subjects.setSubjectSession(id, sessionId);
  assertEquals((await subjects.getSubject(id))!.stage, "presented");

  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  assertEquals((await subjects.getSubject(id))!.stage, "presented");
});

test("unscheduling falls back to speaker or idea", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  const sessionId = await sessions.createSession(FUTURE);
  await subjects.setSubjectSession(id, sessionId);

  await subjects.setSubjectSession(id, null);
  assertEquals((await subjects.getSubject(id))!.stage, "speaker");
});

test("the stage filter returns only subjects at that stage", async () => {
  const idea = await subjects.createSubject("Idea");
  const speaker = await subjects.createSubject("Speaker");
  const planned = await subjects.createSubject("Planned");
  await subjects.setSubjectPeople(speaker, ["Jan de Vries"]);
  await subjects.setSubjectPeople(planned, ["Sanne Bakker"]);
  await subjects.setSubjectSession(
    planned,
    await sessions.createSession(FUTURE),
  );

  const only = (stage: Stage) =>
    subjects.listSubjects({ stage }).then((list) => list.map((s) => s.id));

  assertEquals(await only("idea"), [idea]);
  assertEquals(await only("speaker"), [speaker]);
  assertEquals(await only("planned"), [planned]);
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

  const sessionId = await sessions.createSession(FUTURE);
  await subjects.setSubjectSession(withSpeaker, sessionId);
  await subjects.setSubjectSession(without, sessionId);

  await sessions.deleteSession(sessionId);

  const a = (await subjects.getSubject(withSpeaker))!;
  const b = (await subjects.getSubject(without))!;
  assertEquals(a.sessionId, null);
  assertEquals(b.sessionId, null);
  assertEquals(a.stage, "speaker"); // still has a speaker
  assertEquals(b.stage, "idea"); // does not
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

test("the schedulable pool excludes subjects already on a session", async () => {
  const idea = await subjects.createSubject("Idea");
  const speaker = await subjects.createSubject("Speaker");
  const planned = await subjects.createSubject("Planned");

  await subjects.setSubjectPeople(speaker, ["Jan de Vries"]);
  await subjects.setSubjectSession(
    planned,
    await sessions.createSession(FUTURE),
  );

  const pool = await subjects.listSchedulable();
  assertEquals(pool.map((s) => s.id).sort(), [idea, speaker].sort());
});

test("sorting sinks missing values in both directions", async () => {
  const soon = await sessions.createSession("2030-01-01");
  const later = await sessions.createSession("2030-02-01");

  const a = await subjects.createSubject("beta", later);
  const b = await subjects.createSubject("Alpha", soon);
  const c = await subjects.createSubject("gamma");
  await subjects.setSubjectPeople(a, ["Zoe"]);
  await subjects.setSubjectPeople(b, ["Anna"]);

  const list = await subjects.listSubjects();
  const ids = (key: SortKey, dir: SortDir) =>
    subjects.sortSubjects(list, key, dir).map((s) => s.id);

  assertEquals(ids("title", "asc"), [b, a, c]);
  assertEquals(ids("title", "desc"), [c, a, b]);
  assertEquals(ids("session", "asc"), [b, a, c]);
  assertEquals(ids("session", "desc"), [a, b, c]);
  assertEquals(ids("speakers", "desc"), [a, b, c]);
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

Deno.test("pasting a recording link sets only the recording, and blank clears it", async () => {
  await reset();
  const id = await subjects.createSubject("Recorded talk");
  await subjects.updateSubjectDetails(id, {
    title: "Recorded talk",
    slidesUrl: "https://example.com/slides",
  });

  await subjects.setSubjectRecording(id, " https://example.com/rec ");
  let s = await subjects.getSubject(id);
  assertEquals(s?.recordingUrl, "https://example.com/rec");
  assertEquals(s?.slidesUrl, "https://example.com/slides");

  await subjects.setSubjectRecording(id, "  ");
  s = await subjects.getSubject(id);
  assertEquals(s?.recordingUrl, null);
});

Deno.test("the export card counts what a backup holds", async () => {
  await reset();
  await db.deleteFrom("notes").execute();
  const sessionId = await sessions.createSession(FUTURE, "");
  const id = await subjects.createSubject("Counted", sessionId);
  await subjects.setSubjectPeople(id, ["Ann", "Bo"]);

  assertEquals(await backup.countRecords(), {
    subjects: 1,
    sessions: 1,
    people: 2,
    notes: 0,
  });
});

Deno.test("backup files are named by date", () => {
  assertEquals(
    backup.backupFilename(new Date("2026-10-08T12:00:00Z")),
    "session-planner-2026-10-08.json",
  );
});

// ---------------------------------------------------------------------------
// Running order and start time
// ---------------------------------------------------------------------------

const agenda = async (sessionId: number) =>
  (await sessions.getSession(sessionId))!.subjects.map((s) => s.title);

test("subjects join the end of the running order", async () => {
  const sessionId = await sessions.createSession(FUTURE);
  await subjects.createSubject("First", sessionId);
  const second = await subjects.createSubject("Second");
  await subjects.createSubject("Third", sessionId);
  await subjects.setSubjectSession(second, sessionId);
  assertEquals(await agenda(sessionId), ["First", "Third", "Second"]);
});

test("moving swaps with the neighbour and stops at the ends", async () => {
  const sessionId = await sessions.createSession(FUTURE);
  const first = await subjects.createSubject("First", sessionId);
  await subjects.createSubject("Second", sessionId);
  const third = await subjects.createSubject("Third", sessionId);

  await subjects.moveSubject(third, -1);
  assertEquals(await agenda(sessionId), ["First", "Third", "Second"]);
  await subjects.moveSubject(first, -1);
  await subjects.moveSubject(third, -1);
  assertEquals(await agenda(sessionId), ["Third", "First", "Second"]);
});

test("unscheduling clears the position", async () => {
  const sessionId = await sessions.createSession(FUTURE);
  const id = await subjects.createSubject("Gone", sessionId);
  await subjects.setSubjectSession(id, null);
  assertEquals((await subjects.getSubject(id))!.position, null);
});

test("rescheduling keeps the notes and stores the start time", async () => {
  const id = await sessions.createSession(FUTURE, "Big room");
  await sessions.rescheduleSession(id, {
    date: "2099-02-02",
    startTime: "16:30",
  });
  const s = (await sessions.getSession(id))!;
  assertEquals([s.date, s.startTime, s.notes], [
    "2099-02-02",
    "16:30",
    "Big room",
  ]);
});

Deno.test("only real HH:MM times parse", () => {
  assertEquals(sessions.parseTime(" 09:05 "), "09:05");
  assertEquals(sessions.parseTime("24:00"), null);
  assertEquals(sessions.parseTime(""), null);
  assertEquals(sessions.parseTime(null), null);
});

// Close the shared connection so the test process can exit.
globalThis.addEventListener("unload", () => {
  db.destroy();
  try {
    Deno.removeSync(dbPath);
  } catch { /* already gone */ }
});
