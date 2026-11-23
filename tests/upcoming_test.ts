import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { HttpError } from "fresh";
import type { PublicSession } from "@/services/public_page.ts";

/**
 * The optional public upcoming page (NER-332): it must show future sessions
 * and their running order to strangers, and never a word of the organiser's
 * private fields. The private bits are seeded as "GEHEIM" canaries so any
 * leak, in the view model, the rendered page or the public .ics, fails loudly.
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

const sessions = await import("@/services/sessions.ts");
const subjects = await import("@/services/subjects.ts");
const publicPage = await import("@/services/public_page.ts");
const calendar = await import("@/services/calendar.ts");
const icsRoute = await import("@/routes/upcoming/[id]/ics.ts");
const upcoming = await import("@/routes/upcoming.tsx");

/** Far enough from today that the test never drifts across the boundary. */
const FUTURE = "2099-01-01";
const PAST = "2000-01-01";

const NOTES = "GEHEIM-organiser-notes";
const RECAP = "GEHEIM-recap";
const SLIDES = "https://example.com/GEHEIM-slides";
const RECORDING = "https://example.com/GEHEIM-recording";
const TITLE = "Kubernetes ops, the boring kind";
const DESCRIPTION = "What this session is about, shareable";

/** Empty every table so each test starts from a known state. */
async function reset() {
  await db.deleteFrom("subject_people").execute();
  await db.deleteFrom("subject_links").execute();
  await db.deleteFrom("subjects").execute();
  await db.deleteFrom("sessions").execute();
  await db.deleteFrom("people").execute();
}

/** One future session with a speakered subject full of canaries. */
async function seed(): Promise<number> {
  const sid = await sessions.createSession(FUTURE, NOTES, "16:00");
  const subject = await subjects.createSubject(TITLE, sid);
  await subjects.updateSubjectDetails(subject, {
    title: TITLE,
    description: DESCRIPTION,
    slidesUrl: SLIDES,
    recordingUrl: RECORDING,
    recapNotes: RECAP,
  });
  await subjects.setSubjectPeople(subject, ["Jan de Vries"]);
  return sid;
}

function setEnv(name: string, value?: string) {
  if (value === undefined) Deno.env.delete(name);
  else Deno.env.set(name, value);
}

/** Every string a preact vnode tree will render: text and attribute values. */
function strings(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) strings(child, out);
    return out;
  }
  if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
    const props = (node as { props?: Record<string, unknown> }).props ?? {};
    for (const [key, value] of Object.entries(props)) {
      if (key === "children") strings(value, out);
      else if (typeof value === "string") out.push(value);
    }
    return out;
  }
  return out;
}

/** The page component, called the way Fresh would call it. */
function renderUpcoming(sessionsInView: PublicSession[]): string[] {
  const Page = upcoming.default as unknown as (
    props: { data: { sessions: PublicSession[] } },
  ) => unknown;
  return strings(Page({ data: { sessions: sessionsInView } }));
}

// ---------------------------------------------------------------------------
// PUBLIC_PAGE: off by default, on and noindex when asked
// ---------------------------------------------------------------------------

Deno.test("PUBLIC_PAGE defaults to off and parses on/true/1/noindex", () => {
  const restore = Deno.env.get("PUBLIC_PAGE");
  const cases: [string | undefined, string][] = [
    [undefined, "off"],
    ["", "off"],
    ["off", "off"],
    ["banana", "off"],
    ["on", "on"],
    ["true", "on"],
    ["TRUE", "on"],
    ["1", "on"],
    ["noindex", "noindex"],
    [" noindex ", "noindex"],
  ];
  for (const [value, expected] of cases) {
    setEnv("PUBLIC_PAGE", value);
    assertEquals(publicPage.publicPageMode(), expected);
  }
  setEnv("PUBLIC_PAGE", restore);
});

Deno.test("the public page only serves when switched on", () => {
  const restore = Deno.env.get("PUBLIC_PAGE");
  for (const value of [undefined, "off", "banana"]) {
    setEnv("PUBLIC_PAGE", value);
    assertEquals(publicPage.publicPageEnabled(), false);
  }
  for (const value of ["on", "noindex"]) {
    setEnv("PUBLIC_PAGE", value);
    assertEquals(publicPage.publicPageEnabled(), true);
  }
  setEnv("PUBLIC_PAGE", restore);
});

// ---------------------------------------------------------------------------
// The view model: fields picked at the boundary, not hidden by templates
// ---------------------------------------------------------------------------

Deno.test("the view model keeps the shareable fields and drops the rest", async () => {
  await reset();
  await seed();

  const view = publicPage.publicSessions(
    await sessions.getUpcomingSessions(),
  );
  assertEquals(view.length, 1);
  const session = view[0]!;
  assertEquals(session.date, FUTURE);
  assertEquals(session.startTime, "16:00");
  assertEquals(session.subjects.length, 1);
  assertEquals(session.subjects[0]!.title, TITLE);
  assertEquals(session.subjects[0]!.description, DESCRIPTION);
  assertEquals(session.subjects[0]!.speakers, [{ id: 1, name: "Jan de Vries" }]);

  const json = JSON.stringify(view);
  for (const absent of [NOTES, RECAP, SLIDES, RECORDING]) {
    assert(!json.includes(absent), `should not leak ${absent}`);
  }
  for (
    const field of [
      "notes",
      "recapNotes",
      "recap_notes",
      "slidesUrl",
      "slides_url",
      "recordingUrl",
      "recording_url",
      "checks",
      "bloggable",
      "links",
      "stage",
      "sessionDate",
    ]
  ) {
    assert(!json.includes(field), `should not carry the ${field} field`);
  }
});

// ---------------------------------------------------------------------------
// The rendered page
// ---------------------------------------------------------------------------

Deno.test("the page shows the running order and none of the canaries", async () => {
  await reset();
  await seed();

  const view = publicPage.publicSessions(
    await sessions.getUpcomingSessions(),
  );
  const text = renderUpcoming(view).join("\n");

  for (const absent of [NOTES, RECAP, SLIDES, RECORDING]) {
    assert(!text.includes(absent), `should not leak ${absent}`);
  }
  assertStringIncludes(text, TITLE);
  assertStringIncludes(text, DESCRIPTION);
  assertStringIncludes(text, "Jan de Vries");
  assertStringIncludes(text, "16:00");
  assertStringIncludes(text, "Add to calendar");
  assertStringIncludes(text, `/upcoming/${view[0]!.id}/ics`);
});

Deno.test("the page has an empty state when nothing is ahead", async () => {
  await reset();
  const text = renderUpcoming([]).join("\n");
  assertStringIncludes(text, "No sessions announced yet.");
});

// ---------------------------------------------------------------------------
// The calendar text and the public .ics
// ---------------------------------------------------------------------------

Deno.test("the public agenda keeps the order and drops organiser notes", async () => {
  await reset();
  await seed();

  const session = (await sessions.getUpcomingSessions())[0]!;

  // The private agenda, as before, includes the notes.
  assertStringIncludes(calendar.agendaText(session), NOTES);

  // The public agenda does not, but keeps the running order.
  const agenda = calendar.publicAgendaText(session);
  assert(!agenda.includes(NOTES));
  assertStringIncludes(agenda, TITLE);
  assertStringIncludes(agenda, "Jan de Vries");

  // The .ics takes the override, so the notes stay out there too.
  const ics = calendar.sessionIcs(session, "http://x/upcoming", agenda);
  assert(!ics.includes(NOTES));
  assertStringIncludes(ics, TITLE);

  // Without the override the private behaviour is unchanged.
  assertStringIncludes(calendar.sessionIcs(session, "http://x/"), NOTES);
});

Deno.test("the ics route serves only when on, and only what's ahead", async () => {
  await reset();
  const sid = await seed();
  const past = await sessions.createSession(PAST, NOTES);
  const restore = Deno.env.get("PUBLIC_PAGE");

  const get = (id: string) => icsRoute.upcomingSessionIcs(id, "http://x/");

  // Off (the default): everything is a 404.
  setEnv("PUBLIC_PAGE", undefined);
  await assertRejects(() => get(String(sid)), HttpError);

  // On: an upcoming session is served, without the notes.
  Deno.env.set("PUBLIC_PAGE", "on");
  const res = await get(String(sid));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Content-Type"), "text/calendar; charset=utf-8");
  assertEquals(
    res.headers.get("Content-Disposition"),
    `attachment; filename="session-${sid}-${FUTURE}.ics"`,
  );
  const body = await res.text();
  assert(!body.includes(NOTES));
  assert(!body.includes(RECAP));
  assertStringIncludes(body, TITLE);

  // On, but the session is gone, in the past, or not a number.
  await assertRejects(() => get("NaN"), HttpError);
  await assertRejects(() => get(String(past)), HttpError);
  await assertRejects(() => get("99999"), HttpError);

  // Noindex publishes too; the robots tag itself is rendered by _app.tsx.
  Deno.env.set("PUBLIC_PAGE", "noindex");
  assertEquals((await get(String(sid))).status, 200);

  setEnv("PUBLIC_PAGE", restore);
});
