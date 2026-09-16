import { db } from "@/db/db.ts";
import { STATUS_ORDER } from "@/db/schema.ts";
import { listSubjects, type Subject } from "./subjects.ts";

export interface Session {
  id: number;
  /** ISO yyyy-mm-dd. */
  date: string;
  notes: string | null;
  subjects: Subject[];
}

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
  const all = await listSubjects({ includeArchived: true });
  const bySession = new Map<number, Subject[]>();
  for (const s of all) {
    if (s.sessionId === null) continue;
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    notes: r.notes,
    subjects: bySession.get(r.id) ?? [],
  }));
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
 * Subjects survive: the FK is ON DELETE SET NULL, so they just fall back down the
 * ladder to assigned or idea depending on whether a speaker remains.
 */
export async function deleteSession(id: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // Recompute by hand: SET NULL fires in SQLite, but the status column doesn't
    // know that happened.
    const subjects = await trx
      .selectFrom("subjects")
      .select(["id", "status"])
      .where("session_id", "=", id)
      .execute();

    for (const s of subjects) {
      if (
        s.status === STATUS_ORDER.presented ||
        s.status === STATUS_ORDER.archived
      ) continue;

      const hasPerson = await trx
        .selectFrom("subject_people")
        .select("person_id")
        .where("subject_id", "=", s.id)
        .executeTakeFirst();

      await trx
        .updateTable("subjects")
        .set({
          status: hasPerson ? STATUS_ORDER.assigned : STATUS_ORDER.idea,
        })
        .where("id", "=", s.id)
        .execute();
    }

    await trx.deleteFrom("sessions").where("id", "=", id).execute();
  });
}

/** Mark every still-planned subject on a session as presented, in one click. */
export async function markAllPresented(id: number): Promise<number> {
  const result = await db
    .updateTable("subjects")
    .set({ status: STATUS_ORDER.presented })
    .where("session_id", "=", id)
    .where("status", "=", STATUS_ORDER.planned)
    .executeTakeFirst();

  return Number(result.numUpdatedRows ?? 0);
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
