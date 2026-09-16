import type {
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "@kysely/kysely";

/**
 * The status ladder a topic climbs.
 *
 * Idea, Assigned and Planned are *derived* from two facts — does it have a speaker,
 * and does it have a date — so the status is never something you maintain by hand.
 * Presented and Archived are sticky: once set, only an explicit action moves them.
 */
export const SUBJECT_STATUSES = [
  "idea",
  "assigned",
  "planned",
  "presented",
  "archived",
] as const;

export type SubjectStatus = typeof SUBJECT_STATUSES[number];

/** Stored as an integer so the ladder sorts in its natural order in SQL. */
export const STATUS_ORDER: Record<SubjectStatus, number> = {
  idea: 0,
  assigned: 1,
  planned: 2,
  presented: 3,
  archived: 4,
};

export const STATUS_BY_ORDER = Object.fromEntries(
  Object.entries(STATUS_ORDER).map(([name, n]) => [n, name as SubjectStatus]),
) as Record<number, SubjectStatus>;

/**
 * The order the subjects list uses, which is NOT the stored `status` value.
 *
 * `STATUS_ORDER` above is persisted in the database, so it can never be renumbered.
 * This is purely presentational: what needs your attention comes first — what's
 * booked, then what needs a date, then what needs a speaker — and what's done sinks.
 */
export const STATUS_DISPLAY_ORDER: readonly SubjectStatus[] = [
  "planned",
  "assigned",
  "idea",
  "presented",
  "archived",
] as const;

export const STATUS_MEANING: Record<SubjectStatus, string> = {
  idea: "A topic with nobody on it yet — it needs a speaker.",
  assigned: "Someone has agreed to present it, but it has no date yet.",
  planned: "Scheduled onto a session date.",
  presented: "It happened. Add slides, a recording or notes.",
  archived: "Off your list.",
};

// ---------------------------------------------------------------------------
// Tech radar
// ---------------------------------------------------------------------------

/**
 * The areas the coverage radar is drawn from.
 *
 * A fixed list rather than free-form tags: the point of the radar is to show gaps,
 * and you cannot have a gap in a set that grows to fit whatever people typed.
 */
export const TECH_AREAS = [
  "languages",
  "frontend",
  "backend",
  "data",
  "ai",
  "cloud",
  "devops",
  "testing",
  "security",
  "architecture",
  "process",
  "tooling",
] as const;

export type TechArea = typeof TECH_AREAS[number];

export function isTechArea(value: string): value is TechArea {
  return (TECH_AREAS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export interface PersonTable {
  id: Generated<number>;
  /** Unique, NOCASE — "jan de vries" and "Jan de Vries" can never both exist. */
  name: string;
  created_at: Generated<string>;
}

export interface SubjectTable {
  id: Generated<number>;
  title: string;
  description: string | null;
  /** A STATUS_ORDER value; see the ladder above. */
  status: Generated<number>;
  /** Null while unscheduled. A subject sits on at most one session. */
  session_id: number | null;
  slides_url: string | null;
  recording_url: string | null;
  recap_notes: string | null;
  /** XP promised to whoever claims and presents this. 0 means no bounty. */
  bounty: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface SubjectLinkTable {
  id: Generated<number>;
  subject_id: number;
  url: string;
  label: string | null;
}

export interface SessionTable {
  id: Generated<number>;
  /** ISO yyyy-mm-dd. SQLite has no date type and this sorts lexicographically. */
  date: string;
  notes: string | null;
  created_at: Generated<string>;
}

export interface SubjectPersonTable {
  subject_id: number;
  person_id: number;
}

export interface SubjectTagTable {
  subject_id: number;
  /** One of TECH_AREAS. Validated on the way in; the column is plain text. */
  tag: string;
}

export interface Database {
  people: PersonTable;
  subjects: SubjectTable;
  subject_links: SubjectLinkTable;
  sessions: SessionTable;
  subject_people: SubjectPersonTable;
  subject_tags: SubjectTagTable;
}

export type Person = Selectable<PersonTable>;
export type NewPerson = Insertable<PersonTable>;

export type SubjectRow = Selectable<SubjectTable>;
export type NewSubject = Insertable<SubjectTable>;
export type SubjectUpdate = Updateable<SubjectTable>;

export type SubjectLink = Selectable<SubjectLinkTable>;
export type SessionRow = Selectable<SessionTable>;
