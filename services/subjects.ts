import { type Kysely, sql } from "@kysely/kysely";
import { db } from "@/db/db.ts";
import { type Database, type Person, type SubjectLink } from "@/db/schema.ts";
import { getOrCreatePerson, normalizeName } from "./people.ts";

/** A subject with the things every view of it needs. */
export interface Subject {
  id: number;
  title: string;
  description: string | null;
  stage: Stage;
  sessionId: number | null;
  sessionDate: string | null;
  /** Running order within the session, 1-based; null while unscheduled. */
  position: number | null;
  slidesUrl: string | null;
  recordingUrl: string | null;
  recapNotes: string | null;
  people: Person[];
  links: SubjectLink[];
  /** When `stage` last actually changed; see idleDays(). */
  stageChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectFilter {
  text?: string;
  stage?: Stage;
}

// ---------------------------------------------------------------------------
// The pipeline stage
// ---------------------------------------------------------------------------

/**
 * Idea → Speaker → Planned → Presented. Nothing is stored for this: it is
 * recomputed on every read from whether a subject has a speaker and whether
 * the session it sits on (if any) is in the past or the future. There is no
 * archive state and no manual override — tidying up never happens, because
 * there is nothing to tidy.
 */
export type Stage = "idea" | "speaker" | "planned" | "presented";

export const STAGE_ORDER: readonly Stage[] = [
  "idea",
  "speaker",
  "planned",
  "presented",
];

export const STAGE_LABEL: Record<Stage, string> = {
  idea: "idea",
  speaker: "has speaker",
  planned: "planned",
  presented: "presented",
};

export const STAGE_MEANING: Record<Stage, string> = {
  idea: "A topic with nobody on it yet — it needs a speaker.",
  speaker: "Someone has agreed to present it, but it has no date yet.",
  planned: "Scheduled onto a session date.",
  presented: "It happened. Add slides, a recording or notes.",
};

/** The date in Europe/Amsterdam, as yyyy-mm-dd — stage boundaries run on this. */
export function amsterdamToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" })
    .format(new Date());
}

/**
 * The whole pipeline in one pure function. A session date wins over a
 * speaker either way: past beats everything into presented, future beats a
 * speaker into planned. Only with no session does having a speaker matter.
 */
export function deriveStage(
  hasSpeaker: boolean,
  sessionDate: string | null,
): Stage {
  if (sessionDate !== null) {
    return sessionDate < amsterdamToday() ? "presented" : "planned";
  }
  return hasSpeaker ? "speaker" : "idea";
}

/** The subject's current derived stage, read fresh inside a transaction. */
export async function computeStage(
  trx: Kysely<Database>,
  subjectId: number,
): Promise<Stage> {
  const row = await trx
    .selectFrom("subjects")
    .leftJoin("sessions", "sessions.id", "subjects.session_id")
    .select(["sessions.date as session_date"])
    .where("subjects.id", "=", subjectId)
    .executeTakeFirst();

  const hasSpeaker = await trx
    .selectFrom("subject_people")
    .select("person_id")
    .where("subject_id", "=", subjectId)
    .executeTakeFirst();

  return deriveStage(hasSpeaker !== undefined, row?.session_date ?? null);
}

/**
 * Stamps stage_changed_at if (and only if) `mutate` actually moved the
 * subject to a different stage.
 */
export async function withStageTracking(
  trx: Kysely<Database>,
  subjectId: number,
  mutate: () => Promise<void>,
): Promise<void> {
  const before = await computeStage(trx, subjectId);
  await mutate();
  const after = await computeStage(trx, subjectId);
  if (after !== before) {
    await trx
      .updateTable("subjects")
      .set({ stage_changed_at: sql`current_timestamp` })
      .where("id", "=", subjectId)
      .execute();
  }
}

/** Whole days since the stage last changed, falling back to when it was created. */
export function idleDays(
  subject: Pick<Subject, "stageChangedAt" | "createdAt">,
): number {
  const since = subject.stageChangedAt ?? subject.createdAt;
  // SQLite's current_timestamp is `YYYY-MM-DD HH:MM:SS` UTC, with no offset.
  const changedAtMs = new Date(`${since.replace(" ", "T")}Z`).getTime();
  return Math.floor((Date.now() - changedAtMs) / 86_400_000);
}

/** Days without moving on, per stage, before a subject counts as idle. */
const IDLE_AFTER: Partial<Record<Stage, number>> = {
  idea: 14,
  speaker: 30,
};

/** The idle days to show on a sticker, or null while the subject is moving fine. */
export function idleSticker(
  subject: Pick<Subject, "stage" | "stageChangedAt" | "createdAt">,
): number | null {
  const limit = IDLE_AFTER[subject.stage];
  if (limit === undefined) return null;
  const days = idleDays(subject);
  return days >= limit ? days : null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** People and links for a set of subjects, in two queries rather than 2N. */
async function hydrate(
  rows: Array<{
    id: number;
    title: string;
    description: string | null;
    session_id: number | null;
    session_date: string | null;
    position: number | null;
    slides_url: string | null;
    recording_url: string | null;
    recap_notes: string | null;
    stage_changed_at: string | null;
    created_at: string;
    updated_at: string;
  }>,
): Promise<Subject[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const peopleRows = await db
    .selectFrom("subject_people")
    .innerJoin("people", "people.id", "subject_people.person_id")
    .select([
      "subject_people.subject_id",
      "people.id",
      "people.name",
      "people.created_at",
    ])
    .where("subject_people.subject_id", "in", ids)
    .orderBy("people.name")
    .execute();

  const linkRows = await db
    .selectFrom("subject_links")
    .selectAll()
    .where("subject_id", "in", ids)
    .orderBy("id")
    .execute();

  const peopleBySubject = new Map<number, Person[]>();
  for (const p of peopleRows) {
    const list = peopleBySubject.get(p.subject_id) ?? [];
    list.push({ id: p.id, name: p.name, created_at: p.created_at });
    peopleBySubject.set(p.subject_id, list);
  }

  const byId = new Map<number, Subject>(
    rows.map((r) => {
      const people = peopleBySubject.get(r.id) ?? [];
      return [r.id, {
        id: r.id,
        title: r.title,
        description: r.description,
        stage: deriveStage(people.length > 0, r.session_date),
        sessionId: r.session_id,
        sessionDate: r.session_date,
        position: r.position,
        slidesUrl: r.slides_url,
        recordingUrl: r.recording_url,
        recapNotes: r.recap_notes,
        people,
        links: [],
        stageChangedAt: r.stage_changed_at,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }];
    }),
  );

  for (const l of linkRows) byId.get(l.subject_id)?.links.push(l);

  return rows.map((r) => byId.get(r.id)!);
}

function baseQuery() {
  return db
    .selectFrom("subjects")
    .leftJoin("sessions", "sessions.id", "subjects.session_id")
    .select([
      "subjects.id",
      "subjects.title",
      "subjects.description",
      "subjects.session_id",
      "sessions.date as session_date",
      "subjects.position",
      "subjects.slides_url",
      "subjects.recording_url",
      "subjects.recap_notes",
      "subjects.stage_changed_at",
      "subjects.created_at",
      "subjects.updated_at",
    ]);
}

/**
 * Stage isn't a column, so filtering by it happens after hydration. At the
 * scale this tool runs at (one organiser's backlog) that costs nothing, and
 * it keeps deriveStage() the single place the pipeline logic lives.
 */
export async function listSubjects(
  filter: SubjectFilter = {},
): Promise<Subject[]> {
  let q = baseQuery();

  if (filter.text?.trim()) {
    const t = `%${filter.text.trim()}%`;
    q = q.where((eb) =>
      eb.or([
        eb("subjects.title", "like", t),
        eb("subjects.description", "like", t),
      ])
    );
  }

  const rows = await q.orderBy("subjects.updated_at", "desc").execute();
  const list = await hydrate(rows);
  return filter.stage ? list.filter((s) => s.stage === filter.stage) : list;
}

export async function getSubject(id: number): Promise<Subject | undefined> {
  const row = await baseQuery().where("subjects.id", "=", id)
    .executeTakeFirst();
  if (!row) return undefined;
  return (await hydrate([row]))[0];
}

/** Unscheduled subjects — the pool a session's "add subject" can draw from. */
export async function listSchedulable(): Promise<Subject[]> {
  const rows = await baseQuery()
    .where("subjects.session_id", "is", null)
    .orderBy("subjects.updated_at", "desc")
    .execute();

  const list = await hydrate(rows);
  // Speaker-ready subjects first; Array#sort is stable so each group keeps
  // its own updated_at order.
  return [...list].sort((a, b) =>
    Number(b.stage === "speaker") - Number(a.stage === "speaker")
  );
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const blank = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/** Quick-add: a bare idea from just a title. */
export async function createSubject(
  title: string,
  sessionId?: number | null,
): Promise<number> {
  const inserted = await db
    .insertInto("subjects")
    .values({
      title: title.trim(),
      session_id: sessionId ?? null,
      position: sessionId ? await nextPosition(db, sessionId) : null,
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  return inserted.id;
}

export async function updateSubjectDetails(id: number, fields: {
  title: string;
  description?: string | null;
  slidesUrl?: string | null;
  recordingUrl?: string | null;
  recapNotes?: string | null;
}): Promise<void> {
  if (!fields.title.trim()) return;

  await db
    .updateTable("subjects")
    .set({
      title: fields.title.trim(),
      description: blank(fields.description),
      slides_url: blank(fields.slidesUrl),
      recording_url: blank(fields.recordingUrl),
      recap_notes: blank(fields.recapNotes),
      updated_at: sql`current_timestamp`,
    })
    .where("id", "=", id)
    .execute();
}

export async function setSubjectTitle(
  id: number,
  title: string,
): Promise<void> {
  if (!title.trim()) return;
  await db
    .updateTable("subjects")
    .set({ title: title.trim(), updated_at: sql`current_timestamp` })
    .where("id", "=", id)
    .execute();
}

/** Set or clear just the recording link, as pasted after the session. */
export async function setSubjectRecording(
  id: number,
  url: string,
): Promise<void> {
  await db
    .updateTable("subjects")
    .set({ recording_url: blank(url), updated_at: sql`current_timestamp` })
    .where("id", "=", id)
    .execute();
}

/** Replace the speaker set from typed names, creating the people that are new. */
export async function setSubjectPeople(
  id: number,
  names: string[],
): Promise<void> {
  const wanted = [
    ...new Map(
      names
        .map(normalizeName)
        .filter(Boolean)
        .map((n) => [n.toLowerCase(), n]),
    ).values(),
  ];

  // getOrCreatePerson runs outside the transaction: it may insert, and nesting a
  // write inside SQLite's single write transaction would deadlock the connection.
  const people: Person[] = [];
  for (const name of wanted) people.push(await getOrCreatePerson(name));

  await db.transaction().execute((trx) =>
    withStageTracking(trx, id, async () => {
      await trx.deleteFrom("subject_people").where("subject_id", "=", id)
        .execute();
      if (people.length) {
        await trx
          .insertInto("subject_people")
          .values(people.map((p) => ({ subject_id: id, person_id: p.id })))
          .execute();
      }
    })
  );
}

/** Longest name a visitor may claim a subject under. */
export const CLAIM_NAME_MAX = 60;

/**
 * A visitor volunteers to present an idea. Only ever fills an empty speaker
 * slot, so a claim can't push anyone off a subject. False when the subject is
 * gone, already has a speaker, or the name is blank or too long.
 */
export async function claimSubject(id: number, name: string): Promise<boolean> {
  const speaker = normalizeName(name);
  if (!speaker || speaker.length > CLAIM_NAME_MAX) return false;

  const subject = await getSubject(id);
  if (!subject || subject.people.length > 0) return false;

  await setSubjectPeople(id, [speaker]);
  return true;
}

/**
 * Pass null to unschedule; the stage falls back to speaker or idea. A subject
 * that joins a session goes to the end of its running order.
 */
export async function setSubjectSession(
  id: number,
  sessionId: number | null,
): Promise<void> {
  await db.transaction().execute((trx) =>
    withStageTracking(trx, id, () => placeOnSession(trx, id, sessionId))
  );
}

/** Puts a subject last on `sessionId`; staying on the same one keeps its place. */
async function placeOnSession(
  trx: Kysely<Database>,
  id: number,
  sessionId: number | null,
): Promise<void> {
  const current = await trx.selectFrom("subjects").select("session_id")
    .where("id", "=", id).executeTakeFirst();
  if (current?.session_id === sessionId) return;
  await trx
    .updateTable("subjects")
    .set({
      session_id: sessionId,
      position: sessionId ? await nextPosition(trx, sessionId) : null,
    })
    .where("id", "=", id)
    .execute();
}

/** The position after the last subject on a session. */
async function nextPosition(
  q: Kysely<Database>,
  sessionId: number,
): Promise<number> {
  const row = await q.selectFrom("subjects")
    .select((eb) => eb.fn.max("position").as("last"))
    .where("session_id", "=", sessionId)
    .executeTakeFirst();
  return Number(row?.last ?? 0) + 1;
}

/** Orders a session's subjects by running order; unordered ones go last. */
export function byPosition(a: Subject, b: Subject): number {
  const rank = (s: Subject) => s.position ?? Infinity;
  return rank(a) - rank(b) || a.id - b.id;
}

/**
 * Swaps a subject with its neighbour in its session's running order
 * (-1 = earlier, 1 = later), then renumbers the session 1..n so gaps and
 * duplicates from older data heal themselves. At either end it does nothing.
 */
export async function moveSubject(id: number, step: -1 | 1): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const subject = await trx.selectFrom("subjects").select("session_id")
      .where("id", "=", id).executeTakeFirst();
    if (!subject?.session_id) return;

    const ids = await runningOrder(trx, subject.session_id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await renumber(trx, ids);
  });
}

/** A session's subject ids in running order; unordered ones last. */
async function runningOrder(
  trx: Kysely<Database>,
  sessionId: number,
): Promise<number[]> {
  const rows = await trx.selectFrom("subjects").select("id")
    .where("session_id", "=", sessionId)
    .orderBy(sql`position is null`).orderBy("position").orderBy("id")
    .execute();
  return rows.map((row) => row.id);
}

/** Stores `ids` as positions 1..n. */
async function renumber(trx: Kysely<Database>, ids: number[]): Promise<void> {
  for (const [index, subjectId] of ids.entries()) {
    await trx.updateTable("subjects").set({ position: index + 1 })
      .where("id", "=", subjectId).execute();
  }
}

export async function replaceSubjectLinks(
  id: number,
  links: Array<{ url: string; label?: string | null }>,
): Promise<void> {
  const rows = links
    .filter((l) => l.url.trim())
    .map((l) => ({ subject_id: id, url: l.url.trim(), label: blank(l.label) }));

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("subject_links").where("subject_id", "=", id)
      .execute();
    if (rows.length) {
      await trx.insertInto("subject_links").values(rows).execute();
    }
    await trx
      .updateTable("subjects")
      .set({ updated_at: sql`current_timestamp` })
      .where("id", "=", id)
      .execute();
  });
}

/** Exact title match, case-insensitively — how the new-session form resolves a typed title. */
export async function findSubjectByTitle(
  title: string,
): Promise<Subject | undefined> {
  const t = title.trim();
  if (!t) return undefined;

  const row = await baseQuery()
    .where(sql`lower("subjects"."title")`, "=", t.toLowerCase())
    .executeTakeFirst();
  if (!row) return undefined;
  return (await hydrate([row]))[0];
}

export async function deleteSubject(id: number): Promise<void> {
  await db.deleteFrom("subjects").where("id", "=", id).execute();
}

/** Falls back to the host name so a bare URL still reads as something. */
export function linkLabel(link: SubjectLink): string {
  if (link.label?.trim()) return link.label;
  try {
    return new URL(link.url).host;
  } catch {
    return link.url;
  }
}

// ---------------------------------------------------------------------------
// Sorting the subjects table
// ---------------------------------------------------------------------------

export type SortKey = "title" | "speakers" | "stage" | "session";

export const SORT_KEYS: readonly SortKey[] = [
  "title",
  "speakers",
  "stage",
  "session",
];
export type SortDir = "asc" | "desc";

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

/**
 * Re-orders an already-listed page of subjects. Missing values (no speaker, no
 * date) sink to the bottom in both directions, and ties keep the list's own order,
 * since Array.prototype.sort is stable.
 */
/** Lower-case title, speakers and description: what a board search matches on. */
export function searchText(subject: Subject): string {
  return [
    subject.title,
    ...subject.people.map((p) => p.name),
    subject.description,
  ]
    .filter(Boolean).join(" ").toLowerCase();
}

/** Whether a subject matches a typed search; an empty search matches all. */
export function matchesSearch(subject: Subject, query: string): boolean {
  return searchText(subject).includes(query.trim().toLowerCase());
}

export function sortSubjects(
  list: Subject[],
  key: SortKey,
  dir: SortDir,
): Subject[] {
  const value = (s: Subject): string | number | null => {
    switch (key) {
      case "title":
        return s.title.toLowerCase();
      case "speakers":
        return s.people[0]?.name.toLowerCase() ?? null;
      case "stage":
        return STAGE_ORDER.indexOf(s.stage);
      case "session":
        return s.sessionDate;
    }
  };

  const sign = dir === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === vb) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === "string" && typeof vb === "string") {
      return sign * va.localeCompare(vb);
    }
    return sign * (va < vb ? -1 : 1);
  });
}
