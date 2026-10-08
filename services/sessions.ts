import { sql } from "@kysely/kysely";
import { db } from "@/db/db.ts";
import {
  computeStage,
  listSubjects,
  type Stage,
  type Subject,
} from "./subjects.ts";

export interface Session {
  id: number;
  /** ISO yyyy-mm-dd. */
  date: string;
  notes: string | null;
  subjects: Subject[];
  /** The first few links across this session's subjects, for the card preview. */
  links: Subject["links"];
}

/** Session cards show at most this many links; each subject chip still leads to the rest. */
const PREVIEW_LINKS = 3;

/**
 * Slots per session. The design handoff flags this as an assumption to
 * revisit; change it here if the organiser wants a different number.
 */
export const SESSION_SLOTS = 3;

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isPast(date: string): boolean {
  return date < today();
}

/** One query for the sessions, one for their subjects. */
async function hydrate(
  rows: Array<{ id: number; date: string; notes: string | null }>,
): Promise<Session[]> {
  if (!rows.length) return [];

  // listSubjects already batches people and links.
  const all = await listSubjects();
  const bySession = new Map<number, Subject[]>();
  for (const s of all) {
    if (s.sessionId === null) continue;
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }

  return rows.map((r) => {
    const subjects = bySession.get(r.id) ?? [];
    return {
      id: r.id,
      date: r.date,
      notes: r.notes,
      subjects,
      links: subjects.flatMap((s) => s.links).slice(0, PREVIEW_LINKS),
    };
  });
}

export async function listSessions(): Promise<Session[]> {
  const rows = await db
    .selectFrom("sessions")
    .select(["id", "date", "notes"])
    .orderBy("date", "desc")
    .execute();
  return hydrate(rows);
}

export async function getSession(id: number): Promise<Session | undefined> {
  const row = await db
    .selectFrom("sessions")
    .select(["id", "date", "notes"])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return undefined;
  return (await hydrate([row]))[0];
}

/** Sessions on or after today, soonest first — the dashboard's headline. */
export async function getUpcomingSessions(limit?: number): Promise<Session[]> {
  let query = db
    .selectFrom("sessions")
    .select(["id", "date", "notes"])
    .where("date", ">=", today())
    .orderBy("date");
  if (limit !== undefined) query = query.limit(limit);
  const rows = await query.execute();
  return hydrate(rows);
}

/** The next session on or after today. */
export async function getNextSession(): Promise<Session | undefined> {
  return (await getUpcomingSessions(1))[0];
}

export async function createSession(
  date: string,
  notes?: string | null,
): Promise<number> {
  const row = await db
    .insertInto("sessions")
    .values({ date, notes: notes?.trim() || null })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function updateSession(
  id: number,
  date: string,
  notes?: string | null,
): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ date, notes: notes?.trim() || null })
    .where("id", "=", id)
    .execute();
}

/**
 * Subjects survive: the FK is ON DELETE SET NULL, so they just fall back down
 * the pipeline to speaker or idea depending on whether a speaker remains.
 * The derived stage needs no recomputation by hand — only stage_changed_at
 * does, for the subjects this actually moves.
 */
export async function deleteSession(id: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const subjects = await trx
      .selectFrom("subjects")
      .select("id")
      .where("session_id", "=", id)
      .execute();

    const before = new Map<number, Stage>();
    for (const s of subjects) {
      before.set(s.id, await computeStage(trx, s.id));
    }

    await trx.deleteFrom("sessions").where("id", "=", id).execute();

    for (const s of subjects) {
      const after = await computeStage(trx, s.id);
      if (after !== before.get(s.id)) {
        await trx
          .updateTable("subjects")
          .set({ stage_changed_at: sql`current_timestamp` })
          .where("id", "=", s.id)
          .execute();
      }
    }
  });
}

/** A sensible default so adding a session is usually one click. */
export function nextThursday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function formatLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function daysAway(iso: string): string {
  const ms = new Date(`${iso}T00:00:00`).getTime() -
    new Date(`${today()}T00:00:00`).getTime();
  const days = Math.round(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  const weeks = Math.floor(days / 7);
  return `in ${weeks} week${weeks === 1 ? "" : "s"}`;
}
