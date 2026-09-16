import { assert, assertEquals } from "@std/assert";

/** Same isolation as services_test.ts: a temp file, never the real database. */
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
const scoring = await import("@/services/scoring.ts");

async function reset() {
  await db.deleteFrom("subject_tags").execute();
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

/** A date `months` back from today, so tests don't hard-code a calendar. */
function monthsBack(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** A delivered talk: speaker, dated session, presented. */
async function givenTalk(opts: {
  title: string;
  speakers: string[];
  date: string;
  slides?: boolean;
  recording?: boolean;
  bounty?: number;
  tags?: string[];
}) {
  const id = await subjects.createSubject(opts.title);
  await subjects.setSubjectPeople(id, opts.speakers);
  if (opts.bounty) await subjects.setSubjectBounty(id, opts.bounty);
  if (opts.tags) await subjects.setSubjectTags(id, opts.tags);

  const sessionId = await sessions.createSession(opts.date);
  await subjects.setSubjectSession(id, sessionId);
  await subjects.updateSubjectDetails(id, {
    title: opts.title,
    slidesUrl: opts.slides ? "https://example.com/slides" : null,
    recordingUrl: opts.recording ? "https://example.com/rec" : null,
  });
  await subjects.setSubjectStatus(id, "presented");
  return id;
}

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------

test("XP rises with the rung the subject has reached", async () => {
  const idea = await subjects.createSubject("Idea");
  assertEquals(scoring.subjectXp((await subjects.getSubject(idea))!), 0);

  await subjects.setSubjectPeople(idea, ["Jan"]);
  assertEquals(
    scoring.subjectXp((await subjects.getSubject(idea))!),
    scoring.XP.assigned,
  );

  const sessionId = await sessions.createSession("2026-10-01");
  await subjects.setSubjectSession(idea, sessionId);
  assertEquals(
    scoring.subjectXp((await subjects.getSubject(idea))!),
    scoring.XP.planned,
  );

  await subjects.setSubjectStatus(idea, "presented");
  assertEquals(
    scoring.subjectXp((await subjects.getSubject(idea))!),
    scoring.XP.presented,
  );
});

test("the archivist bonus needs both slides and a recording", async () => {
  const slidesOnly = await givenTalk({
    title: "Slides only",
    speakers: ["Jan"],
    date: monthsBack(1),
    slides: true,
  });
  assertEquals(
    scoring.subjectXp((await subjects.getSubject(slidesOnly))!),
    scoring.XP.presented,
  );

  const both = await givenTalk({
    title: "Both",
    speakers: ["Sanne"],
    date: monthsBack(1),
    slides: true,
    recording: true,
  });
  assertEquals(
    scoring.subjectXp((await subjects.getSubject(both))!),
    scoring.XP.presented + scoring.XP.archivist,
  );
});

test("a bounty is only collected once the talk is delivered", async () => {
  const id = await subjects.createSubject("Bountied");
  await subjects.setSubjectBounty(id, 25);
  assertEquals(scoring.subjectXp((await subjects.getSubject(id))!), 0);

  await subjects.setSubjectPeople(id, ["Jan"]);
  assertEquals(
    scoring.subjectXp((await subjects.getSubject(id))!),
    scoring.XP.assigned,
    "claiming alone must not pay out",
  );

  const sessionId = await sessions.createSession(monthsBack(1));
  await subjects.setSubjectSession(id, sessionId);
  await subjects.setSubjectStatus(id, "presented");
  assertEquals(
    scoring.subjectXp((await subjects.getSubject(id))!),
    scoring.XP.presented + 25,
  );
});

test("a negative bounty is clamped to zero", async () => {
  const id = await subjects.createSubject("Nice try");
  await subjects.setSubjectBounty(id, -50);
  assertEquals((await subjects.getSubject(id))!.bounty, 0);
});

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

test("the leaderboard ranks by XP and splits credit between co-speakers", async () => {
  await givenTalk({
    title: "Pair talk",
    speakers: ["Jan", "Sanne"],
    date: monthsBack(2),
  });
  await givenTalk({
    title: "Solo, fully archived",
    speakers: ["Sanne"],
    date: monthsBack(3),
    slides: true,
    recording: true,
  });

  const board = await scoring.leaderboard();
  assertEquals(board.map((s) => s.name), ["Sanne", "Jan"]);
  assertEquals(board[0].talks, 2);
  assertEquals(board[0].archived, 1);
  assertEquals(board[1].talks, 1);
  // Both speakers on a shared talk get the full value: it's credit, not a pie.
  assertEquals(board[1].xp, scoring.XP.presented);
});

test("the rolling window excludes talks older than it", async () => {
  await givenTalk({
    title: "Ancient history",
    speakers: ["Old Timer"],
    date: monthsBack(20),
  });
  await givenTalk({
    title: "Recent",
    speakers: ["Newcomer"],
    date: monthsBack(2),
  });

  const rolling = await scoring.leaderboard();
  assertEquals(rolling.map((s) => s.name), ["Newcomer"]);

  const allTime = await scoring.leaderboard({ from: "1970-01-01" });
  assertEquals(allTime.length, 2);
});

test("a speaker's areas count only delivered talks, matching the radar", async () => {
  await givenTalk({
    title: "Delivered",
    speakers: ["Jan"],
    date: monthsBack(1),
    tags: ["security"],
  });

  const planned = await subjects.createSubject("Only planned");
  await subjects.setSubjectTags(planned, ["ai"]);
  await subjects.setSubjectPeople(planned, ["Jan"]);

  const board = await scoring.leaderboard();
  assertEquals(board[0].areas, ["security"], "an intention is not coverage");

  const areas = await scoring.radar();
  assertEquals(areas.find((a) => a.area === "ai")!.presented, 0);
  assertEquals(areas.find((a) => a.area === "ai")!.upcoming, 1);
});

// ---------------------------------------------------------------------------
// Seasons and the trophy
// ---------------------------------------------------------------------------

test("seasons are calendar quarters", () => {
  assertEquals(scoring.seasonFor("2026-01-15").key, "2026-Q1");
  assertEquals(scoring.seasonFor("2026-09-05").key, "2026-Q3");
  assertEquals(scoring.seasonFor("2026-12-31").key, "2026-Q4");

  const q4 = scoring.seasonFor("2026-11-01");
  assertEquals(q4.start, "2026-10-01");
  assertEquals(q4.end, "2027-01-01", "Q4 must roll into the next year");
});

test("the trophy is held by the top speaker of the last completed quarter", async () => {
  const previous = scoring.previousSeason();
  // Mid-quarter, so it lands inside the window whichever quarter it is.
  const inPrevious = previous.start.slice(0, 8) + "15";

  await givenTalk({ title: "A", speakers: ["Winner"], date: inPrevious });
  await givenTalk({
    title: "B",
    speakers: ["Winner"],
    date: inPrevious,
    slides: true,
    recording: true,
  });
  await givenTalk({ title: "C", speakers: ["Runner Up"], date: inPrevious });

  const { season, champion } = await scoring.trophyHolder();
  assertEquals(season.key, previous.key);
  assertEquals(champion?.name, "Winner");
  assertEquals(champion?.talks, 2);
});

test("nobody holds the trophy when the last quarter had no talks", async () => {
  const { champion } = await scoring.trophyHolder();
  assertEquals(champion, null);
});

// ---------------------------------------------------------------------------
// XP belongs to speakers, not to whoever runs the board
// ---------------------------------------------------------------------------

test("capturing ideas earns nobody any XP", async () => {
  for (const title of ["One", "Two", "Three"]) {
    await subjects.createSubject(title);
  }

  const progress = await scoring.seasonProgress();
  assertEquals(progress.subjectsAdded, 3, "still reported as a count");
  assertEquals(progress.xp, 0, "but worth no XP at all");
  assertEquals((await scoring.leaderboard()).length, 0);
});

test("the season bar is the sum of what speakers earned that season", async () => {
  const season = scoring.currentSeason();
  const inSeason = season.start.slice(0, 8) + "15";

  await givenTalk({ title: "Solo", speakers: ["Jan"], date: inSeason });
  await givenTalk({
    title: "Pair",
    speakers: ["Jan", "Sanne"],
    date: inSeason,
    slides: true,
    recording: true,
  });
  // Delivered in a different season, so it must not count towards this bar.
  await givenTalk({ title: "Old", speakers: ["Jan"], date: monthsBack(20) });

  const progress = await scoring.seasonProgress();
  const board = await scoring.leaderboard({
    from: season.start,
    to: season.end,
  });
  const boardTotal = board.reduce((sum, s) => sum + s.xp, 0);

  assertEquals(progress.talks, 2);
  assertEquals(progress.speakers, 2);
  assertEquals(
    progress.xp,
    boardTotal,
    "the bar and the season leaderboard must agree",
  );
});

test("an undated commitment cannot inflate a past season", async () => {
  const previous = scoring.previousSeason();
  const inPrevious = previous.start.slice(0, 8) + "15";

  await givenTalk({
    title: "Real talk",
    speakers: ["Winner"],
    date: inPrevious,
  });

  // Signed up for something with no date at all.
  const pending = await subjects.createSubject("Someday");
  await subjects.setSubjectPeople(pending, ["Opportunist"]);

  const seasonBoard = await scoring.leaderboard({
    from: previous.start,
    to: previous.end,
  });
  assertEquals(
    seasonBoard.map((s) => s.name),
    ["Winner"],
    "a dateless commitment belongs to no season",
  );

  const { champion } = await scoring.trophyHolder();
  assertEquals(champion?.name, "Winner");

  // The open-ended rolling board still shows current commitments.
  const rolling = await scoring.leaderboard();
  assert(rolling.some((s) => s.name === "Opportunist"));
});

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------

test("the radar counts delivered and upcoming talks per area", async () => {
  await givenTalk({
    title: "Done",
    speakers: ["Jan"],
    date: monthsBack(1),
    tags: ["data", "cloud"],
  });

  const planned = await subjects.createSubject("Coming up");
  await subjects.setSubjectTags(planned, ["data"]);
  await subjects.setSubjectPeople(planned, ["Sanne"]);

  const areas = await scoring.radar();
  const data = areas.find((a) => a.area === "data")!;
  const cloud = areas.find((a) => a.area === "cloud")!;
  const security = areas.find((a) => a.area === "security")!;

  assertEquals(data.presented, 1);
  assertEquals(data.upcoming, 1);
  assertEquals(cloud.presented, 1);
  assertEquals(security.presented, 0, "an untouched area is a visible gap");
  assert(areas.length >= 12, "every area appears, covered or not");
});

test("unknown tags are rejected rather than stored", async () => {
  const id = await subjects.createSubject("Tagged");
  await subjects.setSubjectTags(id, ["data", "not-a-real-area", "ai"]);
  assertEquals((await subjects.getSubject(id))!.tags, ["ai", "data"]);
});

// ---------------------------------------------------------------------------
// Roulette
// ---------------------------------------------------------------------------

test("roulette offers people who are overdue, never-presented first", async () => {
  await givenTalk({
    title: "Recent",
    speakers: ["Just Went"],
    date: monthsBack(1),
  });
  await givenTalk({
    title: "A while ago",
    speakers: ["Overdue"],
    date: monthsBack(14),
  });
  await (await import("@/services/people.ts")).addPerson("Never Presented");

  const pool = await scoring.rouletteCandidates(6);
  assertEquals(pool.map((c) => c.name), ["Never Presented", "Overdue"]);
  assertEquals(pool[0].lastPresented, null);
  assert((pool[1].monthsSince ?? 0) >= 13);
});

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------

test("open bounties are unclaimed, undelivered and richest first", async () => {
  const small = await subjects.createSubject("Small");
  await subjects.setSubjectBounty(small, 5);

  const big = await subjects.createSubject("Big");
  await subjects.setSubjectBounty(big, 50);

  const claimed = await subjects.createSubject("Already taken");
  await subjects.setSubjectBounty(claimed, 99);
  await subjects.setSubjectPeople(claimed, ["Jan"]);

  const open = await scoring.openBounties();
  assertEquals(open.map((s) => s.title), ["Big", "Small"]);
});

globalThis.addEventListener("unload", () => {
  db.destroy();
  try {
    Deno.removeSync(dbPath);
  } catch { /* already gone */ }
});
