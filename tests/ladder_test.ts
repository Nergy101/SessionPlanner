import { assert, assertEquals, assertNotEquals } from "@std/assert";

/**
 * Same isolation as services_test.ts: a temp file, never the real database.
 * Needed here because stage_changed_at bookkeeping only happens through the
 * database-backed writes (setSubjectPeople, setSubjectSession).
 *
 * DB_PATH must be set before @/db/db.ts opens its connection at module load,
 * so every module that transitively touches the database below is imported
 * dynamically, after the env var is set — a static import would race it.
 */
const dbPath = await Deno.makeTempFile({ suffix: ".db" });
Deno.env.set("DB_PATH", dbPath);

const { db } = await import("@/db/db.ts");
const { Migrator } = await import("@kysely/kysely/migration");
const { migrations } = await import("@/db/migrations/index.ts");

const { error } = await new Migrator({
  db,
  provider: { getMigrations: () => Promise.resolve(migrations) },
}).migrateToLatest();
if (error) throw error;

const subjects = await import("@/services/subjects.ts");
const sessions = await import("@/services/sessions.ts");

async function reset() {
  await db.deleteFrom("subject_people").execute();
  await db.deleteFrom("subject_links").execute();
  await db.deleteFrom("subjects").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("people").execute();
}

const test = (name: string, fn: () => void | Promise<void>) =>
  Deno.test(name, async () => {
    await reset();
    await fn();
  });

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// deriveStage — pure function, precedence and the boundary
// ---------------------------------------------------------------------------

Deno.test("no speaker and no session is an idea", () => {
  assertEquals(subjects.deriveStage(false, null), "idea");
});

Deno.test("a speaker with no session is speaker", () => {
  assertEquals(subjects.deriveStage(true, null), "speaker");
});

Deno.test("planned beats speaker: a future session wins regardless of a speaker", () => {
  const future = shiftDate(subjects.amsterdamToday(), 10);
  assertEquals(subjects.deriveStage(true, future), "planned");
  assertEquals(subjects.deriveStage(false, future), "planned");
});

Deno.test("presented beats planned and speaker: a past session wins regardless of a speaker", () => {
  const past = shiftDate(subjects.amsterdamToday(), -10);
  assertEquals(subjects.deriveStage(true, past), "presented");
  assertEquals(subjects.deriveStage(false, past), "presented");
});

Deno.test("a session dated today is planned, one dated yesterday is presented", () => {
  const today = subjects.amsterdamToday();
  const yesterday = shiftDate(today, -1);
  assertEquals(subjects.deriveStage(false, today), "planned");
  assertEquals(subjects.deriveStage(false, yesterday), "presented");
});

// ---------------------------------------------------------------------------
// End to end through the database
// ---------------------------------------------------------------------------

test("removing the last speaker returns a subject to idea", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  assertEquals((await subjects.getSubject(id))!.stage, "speaker");

  await subjects.setSubjectPeople(id, []);
  assertEquals((await subjects.getSubject(id))!.stage, "idea");
});

test("stage_changed_at only moves on a real stage change", async () => {
  const id = await subjects.createSubject("Testcontainers in CI");
  assertEquals((await subjects.getSubject(id))!.stageChangedAt, null);

  // idea -> speaker is a real change.
  await subjects.setSubjectPeople(id, ["Jan de Vries"]);
  const afterFirstSpeaker = (await subjects.getSubject(id))!.stageChangedAt;
  assert(afterFirstSpeaker !== null);

  // Adding a co-speaker stays at "speaker" — no change, no new timestamp.
  await subjects.setSubjectPeople(id, ["Jan de Vries", "Sanne Bakker"]);
  assertEquals(
    (await subjects.getSubject(id))!.stageChangedAt,
    afterFirstSpeaker,
  );

  // speaker -> planned is a real change again. The clock only has
  // one-second resolution, so wait past the second already recorded.
  const { promise: tick, resolve: tock } = Promise.withResolvers<void>();
  setTimeout(tock, 1100);
  await tick;
  const future = shiftDate(sessions.today(), 10);
  const sessionId = await sessions.createSession(future);
  await subjects.setSubjectSession(id, sessionId);
  const afterScheduled = (await subjects.getSubject(id))!.stageChangedAt;
  assert(afterScheduled !== null);
  assertNotEquals(afterScheduled, afterFirstSpeaker);
});

// ---------------------------------------------------------------------------
// Idle days
// ---------------------------------------------------------------------------

Deno.test("idle days is whole days since the stage last changed", () => {
  const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000 - 60_000)
    .toISOString().replace("T", " ").slice(0, 19);
  assertEquals(
    subjects.idleDays({
      stageChangedAt: fourDaysAgo,
      createdAt: "2000-01-01 00:00:00",
    }),
    4,
  );
});

Deno.test("idle days falls back to created_at when the stage never changed", () => {
  const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000 - 60_000)
    .toISOString().replace("T", " ").slice(0, 19);
  assertEquals(
    subjects.idleDays({ stageChangedAt: null, createdAt: fourDaysAgo }),
    4,
  );
});

// Close the shared connection so the test process can exit.
globalThis.addEventListener("unload", () => {
  db.destroy();
  try {
    Deno.removeSync(dbPath);
  } catch { /* already gone */ }
});
