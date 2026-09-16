import { type Kysely, sql } from "@kysely/kysely";
import { db } from "@/db/db.ts";
import {
  type Database,
  isTechArea,
  type Person,
  STATUS_BY_ORDER,
  STATUS_DISPLAY_ORDER,
  STATUS_ORDER,
  type SubjectLink,
  type SubjectStatus,
  type TechArea,
} from "@/db/schema.ts";
import { getOrCreatePerson, normalizeName } from "./people.ts";

/** A subject with the things every view of it needs. */
export interface Subject {
  id: number;
  title: string;
  description: string | null;
  status: SubjectStatus;
  sessionId: number | null;
  sessionDate: string | null;
  slidesUrl: string | null;
  recordingUrl: string | null;
  recapNotes: string | null;
  people: Person[];
  links: SubjectLink[];
  tags: TechArea[];
  /** XP promised to whoever claims and presents this. 0 means no bounty. */
  bounty: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectFilter {
  text?: string;
  status?: SubjectStatus;
  personId?: number;
  /** Archived is hidden unless you go looking for it. */
  includeArchived?: boolean;
}

// ---------------------------------------------------------------------------
// The status ladder
// ---------------------------------------------------------------------------

/**
 * Idea → Assigned → Planned are derived from two facts: does it have a speaker, and
 * does it have a date. Presented and Archived are sticky — once set, only an explicit
 * status change moves them, so tidying up never rewrites history.
 */
export function deriveStatus(
  current: SubjectStatus,
  hasPeople: boolean,
  hasSession: boolean,
): SubjectStatus {
  if (current === "presented" || current === "archived") return current;
  if (hasSession) return "planned";
  return hasPeople ? "assigned" : "idea";
}

/** Recompute and persist the ladder position after a people/session change. */
async function recomputeStatus(
  trx: Kysely<Database>,
  subjectId: number,
): Promise<void> {
  const row = await trx
    .selectFrom("subjects")
    .select(["status", "session_id"])
    .where("id", "=", subjectId)
    .executeTakeFirst();
  if (!row) return;

  const peopleCount = await trx
    .selectFrom("subject_people")
    .select("person_id")
    .where("subject_id", "=", subjectId)
    .executeTakeFirst();

  const next = deriveStatus(
    STATUS_BY_ORDER[row.status],
    peopleCount !== undefined,
    row.session_id !== null,
  );

  await trx
    .updateTable("subjects")
    .set({ status: STATUS_ORDER[next], updated_at: sql`current_timestamp` })
    .where("id", "=", subjectId)
    .execute();
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
    status: number;
    session_id: number | null;
    session_date: string | null;
    slides_url: string | null;
    recording_url: string | null;
    recap_notes: string | null;
    bounty: number;
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

  const tagRows = await db
    .selectFrom("subject_tags")
    .selectAll()
    .where("subject_id", "in", ids)
    .orderBy("tag")
    .execute();

  const byId = new Map<number, Subject>(
    rows.map((r) => [r.id, {
      id: r.id,
      title: r.title,
      description: r.description,
      status: STATUS_BY_ORDER[r.status],
      sessionId: r.session_id,
      sessionDate: r.session_date,
      slidesUrl: r.slides_url,
      recordingUrl: r.recording_url,
      recapNotes: r.recap_notes,
      people: [],
      links: [],
      tags: [],
      bounty: r.bounty,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }]),
  );

  for (const p of peopleRows) {
    byId.get(p.subject_id)?.people.push({
      id: p.id,
      name: p.name,
      created_at: p.created_at,
    });
  }
  for (const l of linkRows) byId.get(l.subject_id)?.links.push(l);
  for (const t of tagRows) byId.get(t.subject_id)?.tags.push(t.tag as TechArea);

  return rows.map((r) => byId.get(r.id)!);
}

/**
 * ORDER BY over the presentational rank rather than the stored status integer.
 * Built from STATUS_DISPLAY_ORDER so the two can never drift apart.
 */
function displayRank() {
  const whens = STATUS_DISPLAY_ORDER.map((status, rank) =>
    sql`when ${sql.lit(STATUS_ORDER[status])} then ${sql.lit(rank)}`
  );
  return sql`case "subjects"."status" ${sql.join(whens, sql` `)} else ${
    sql.lit(STATUS_DISPLAY_ORDER.length)
  } end`;
}

function baseQuery() {
  return db
    .selectFrom("subjects")
    .leftJoin("sessions", "sessions.id", "subjects.session_id")
    .select([
      "subjects.id",
      "subjects.title",
      "subjects.description",
      "subjects.status",
      "subjects.session_id",
      "sessions.date as session_date",
      "subjects.slides_url",
      "subjects.recording_url",
      "subjects.recap_notes",
      "subjects.bounty",
      "subjects.created_at",
      "subjects.updated_at",
    ]);
}

export async function listSubjects(
  filter: SubjectFilter = {},
): Promise<Subject[]> {
  let q = baseQuery();

  if (!filter.includeArchived && filter.status !== "archived") {
    q = q.where("subjects.status", "!=", STATUS_ORDER.archived);
  }
  if (filter.status) {
    q = q.where("subjects.status", "=", STATUS_ORDER[filter.status]);
  }
  if (filter.personId !== undefined) {
    q = q.where(
      "subjects.id",
      "in",
      db.selectFrom("subject_people").select("subject_id").where(
        "person_id",
        "=",
        filter.personId,
      ),
    );
  }
  if (filter.text?.trim()) {
    const t = `%${filter.text.trim()}%`;
    q = q.where((eb) =>
      eb.or([
        eb("subjects.title", "like", t),
        eb("subjects.description", "like", t),
      ])
    );
  }

  // Attention order (planned, assigned, idea, presented, archived), then most
  // recently touched within each group.
  const rows = await q
    .orderBy(displayRank())
    .orderBy("subjects.updated_at", "desc")
    .execute();

  return hydrate(rows);
}

export async function getSubject(id: number): Promise<Subject | undefined> {
  const row = await baseQuery().where("subjects.id", "=", id)
    .executeTakeFirst();
  if (!row) return undefined;
  return (await hydrate([row]))[0];
}

/** Unscheduled, not archived, not already presented — the pool to schedule from. */
export async function listSchedulable(): Promise<Subject[]> {
  const rows = await baseQuery()
    .where("subjects.session_id", "is", null)
    .where("subjects.status", "not in", [
      STATUS_ORDER.archived,
      STATUS_ORDER.presented,
    ])
    .orderBy("subjects.status", "desc") // assigned (1) before idea (0)
    .orderBy("subjects.updated_at", "desc")
    .execute();

  return hydrate(rows);
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
      status: sessionId ? STATUS_ORDER.planned : STATUS_ORDER.idea,
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

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("subject_people").where("subject_id", "=", id)
      .execute();
    if (people.length) {
      await trx
        .insertInto("subject_people")
        .values(people.map((p) => ({ subject_id: id, person_id: p.id })))
        .execute();
    }
    await recomputeStatus(trx, id);
  });
}

/** Pass null to unschedule; the ladder falls back to assigned or idea. */
export async function setSubjectSession(
  id: number,
  sessionId: number | null,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("subjects")
      .set({ session_id: sessionId })
      .where("id", "=", id)
      .execute();
    await recomputeStatus(trx, id);
  });
}

/** The manual override, and the only way into or out of the sticky states. */
export async function setSubjectStatus(
  id: number,
  status: SubjectStatus,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("subjects")
      .set({ status: STATUS_ORDER[status], updated_at: sql`current_timestamp` })
      .where("id", "=", id)
      .execute();

    // Leaving a sticky state hands control back to the ladder.
    if (status !== "presented" && status !== "archived") {
      await recomputeStatus(trx, id);
    }
  });
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

/** Replace a subject's tech-area tags. Unknown areas are ignored. */
export async function setSubjectTags(
  id: number,
  tags: string[],
): Promise<void> {
  const wanted = [...new Set(tags.filter(isTechArea))];

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("subject_tags").where("subject_id", "=", id).execute();
    if (wanted.length) {
      await trx
        .insertInto("subject_tags")
        .values(wanted.map((tag) => ({ subject_id: id, tag })))
        .execute();
    }
    await trx
      .updateTable("subjects")
      .set({ updated_at: sql`current_timestamp` })
      .where("id", "=", id)
      .execute();
  });
}

/** Put XP on an unclaimed subject, to tempt someone into taking it. */
export async function setSubjectBounty(
  id: number,
  bounty: number,
): Promise<void> {
  const value = Number.isFinite(bounty) ? Math.max(0, Math.trunc(bounty)) : 0;
  await db
    .updateTable("subjects")
    .set({ bounty: value, updated_at: sql`current_timestamp` })
    .where("id", "=", id)
    .execute();
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

export const SORT_KEYS = [
  "title",
  "speakers",
  "status",
  "session",
  "bounty",
] as const;
export type SortKey = typeof SORT_KEYS[number];
export type SortDir = "asc" | "desc";

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

/**
 * Re-orders an already-listed page of subjects. Missing values (no speaker, no
 * date) sink to the bottom in both directions, and ties keep the list's own order,
 * since Array.prototype.sort is stable.
 */
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
      case "status":
        return STATUS_ORDER[s.status];
      case "session":
        return s.sessionDate;
      case "bounty":
        return s.bounty;
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
