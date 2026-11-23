import type { Session } from "./sessions.ts";

/**
 * The optional public page (NER-332): a read-only list of everything still
 * ahead. `PUBLIC_PAGE=on` publishes /upcoming, `PUBLIC_PAGE=noindex`
 * publishes it behind a robots meta tag, and anything else — including
 * unset — keeps the whole thing a 404.
 */
export function publicPageMode(): "off" | "on" | "noindex" {
  const value = Deno.env.get("PUBLIC_PAGE")?.trim().toLowerCase();
  if (value === "on" || value === "true" || value === "1") return "on";
  if (value === "noindex") return "noindex";
  return "off";
}

/** Whether /upcoming may serve anything at all. */
export function publicPageEnabled(): boolean {
  return publicPageMode() !== "off";
}

/** A speaker as the public page shows them: name and picture, nothing else. */
export interface PublicSpeaker {
  id: number;
  name: string;
}

/** A subject in running order, without any of the organiser's fields. */
export interface PublicSubject {
  title: string;
  description: string | null;
  speakers: PublicSpeaker[];
}

/** A session as strangers may see it. */
export interface PublicSession {
  id: number;
  /** ISO yyyy-mm-dd. */
  date: string;
  /** "HH:MM" in Amsterdam time, or null when not decided yet. */
  startTime: string | null;
  subjects: PublicSubject[];
}

/**
 * Explicitly pick the fields a stranger may see. Everything else — organiser
 * notes, recap notes, checks, slides and recording links, stage bookkeeping —
 * is dropped here, at the boundary, rather than hidden by the templates.
 */
export function publicSessions(sessions: Session[]): PublicSession[] {
  return sessions.map((session) => ({
    id: session.id,
    date: session.date,
    startTime: session.startTime,
    subjects: session.subjects.map((subject) => ({
      title: subject.title,
      description: subject.description,
      speakers: subject.people.map((person) => ({
        id: person.id,
        name: person.name,
      })),
    })),
  }));
}
