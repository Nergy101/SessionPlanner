import type {
  Generated,
  Insertable,
  Selectable,
  Updateable,
} from "@kysely/kysely";

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
  /**
   * Orphaned: the old status-ladder value. No longer read or written — stage
   * (idea/speaker/planned/presented) is derived on every read in
   * services/subjects.ts. Left in place rather than dropped, so an existing
   * database upgrades without data loss.
   */
  status: Generated<number>;
  /** Null while unscheduled. A subject sits on at most one session. */
  session_id: number | null;
  slides_url: string | null;
  recording_url: string | null;
  recap_notes: string | null;
  /**
   * Orphaned: XP bounty from the removed gamification feature. No longer
   * read or written. Left in place rather than dropped.
   */
  bounty: Generated<number>;
  /**
   * When the derived stage (idea/speaker/planned/presented) last actually
   * changed. Null until the first real change; idleDays() in
   * services/subjects.ts falls back to created_at. See 004_stage_changed_at.
   */
  stage_changed_at: string | null;
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
  /**
   * Orphaned: the removed coverage-radar's tag vocabulary. The column is
   * plain text and no longer validated or written by the app.
   */
  tag: string;
}

export interface NoteTable {
  id: Generated<number>;
  /** Free text, as typed. Line breaks are kept. */
  body: string;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface Database {
  people: PersonTable;
  subjects: SubjectTable;
  subject_links: SubjectLinkTable;
  sessions: SessionTable;
  subject_people: SubjectPersonTable;
  subject_tags: SubjectTagTable;
  notes: NoteTable;
}

export type Note = Selectable<NoteTable>;

export type Person = Selectable<PersonTable>;
export type NewPerson = Insertable<PersonTable>;

export type SubjectRow = Selectable<SubjectTable>;
export type NewSubject = Insertable<SubjectTable>;
export type SubjectUpdate = Updateable<SubjectTable>;

export type SubjectLink = Selectable<SubjectLinkTable>;
export type SessionRow = Selectable<SessionTable>;
