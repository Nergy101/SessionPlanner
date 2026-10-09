import { sql } from "@kysely/kysely";
import { db } from "@/db/db.ts";
import type { SessionRow } from "@/db/schema.ts";
import {
  byPosition,
  computeStage,
  listSubjects,
  type Stage,
  type Subject,
} from "./subjects.ts";

export interface Session {
  id: number;
  /** ISO yyyy-mm-dd. */
  date: string;
  /** "HH:MM" in Amsterdam time, or null when not decided yet. */
  startTime: string | null;
  notes: string | null;
  /** In running order. */
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

/** A form's "HH:MM", or null for blank or anything that isn't a time. */
export function parseTime(value: unknown): string | null {
  const time = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null;
}

const SESSION_COLUMNS = ["id", "date", "start_time", "notes"] as const;

/** One query for the sessions, one for their subjects. */
async function hydrate(
  rows: Pick<SessionRow, typeof SESSION_COLUMNS[number]>[],
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
    const subjects = (bySession.get(r.id) ?? []).sort(byPosition);
    return {
      id: r.id,
      date: r.date,
      startTime: r.start_time,
      notes: r.notes,
      subjects,
      links: subjects.flatMap((s) => s.links).slice(0, PREVIEW_LINKS),
    };
  });
}

export async function listSessions(): Promise<Session[]> {
  const rows = await db
    .selectFrom("sessions")
    .select(SESSION_COLUMNS)
    .orderBy("date", "desc")
    .execute();
  return hydrate(rows);
}

export async function getSession(id: number): Promise<Session | undefined> {
  const row = await db
    .selectFrom("sessions")
    .select(SESSION_COLUMNS)
    .where("id", "=", id)
    .executeTakeFirst();
  if (!row) return undefined;
  return (await hydrate([row]))[0];
}

/** Sessions on or after today, soonest first — the dashboard's headline. */
export async function getUpcomingSessions(limit?: number): Promise<Session[]> {
  let query = db
    .selectFrom("sessions")
    .select(SESSION_COLUMNS)
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
  startTime: string | null = null,
): Promise<number> {
  const row = await db
    .insertInto("sessions")
    .values({ date, start_time: startTime, notes: notes?.trim() || null })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** When a session happens; a null start time means "not decided yet". */
export interface SessionTime {
  date: string;
  startTime: string | null;
}

export async function rescheduleSession(
  id: number,
  { date, startTime }: SessionTime,
): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ date, start_time: startTime })
    .where("id", "=", id)
    .execute();
}

export async function setSessionNotes(
  id: number,
  notes: string | null,
): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ notes: notes?.trim() || null })
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
  });
}

/** Whole days from today to `iso`: negative once that day has passed. */
export function daysUntil(iso: string): number {
  const ms = new Date(`${iso}T00:00:00`).getTime() -
    new Date(`${today()}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

export function daysAway(iso: string): string {
  const days = daysUntil(iso);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  const weeks = Math.floor(days / 7);
  return `in ${weeks} week${weeks === 1 ? "" : "s"}`;
}

/** SQLite's UTC `YYYY-MM-DD HH:MM:SS` as "8 Oct, 14:05" in Amsterdam time. */
export function formatTimestamp(utc: string): string {
  return new Date(`${utc.replace(" ", "T")}Z`).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}
