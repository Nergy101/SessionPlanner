import { db } from "@/db/db.ts";
import { type SubjectStatus, TECH_AREAS, type TechArea } from "@/db/schema.ts";
import { listSubjects, type Subject } from "./subjects.ts";
import { today } from "./sessions.ts";

/**
 * Everything here is *derived* from subjects, sessions and people. Nothing is stored.
 *
 * A stored score is a second source of truth: rename a person, delete a subject,
 * un-present a talk, and the number silently stops matching the thing it claims to
 * measure. Recomputing costs nothing at this size and can never drift.
 */

// ---------------------------------------------------------------------------
// XP rules
// ---------------------------------------------------------------------------

/**
 * XP is earned by the people who do the talks — nobody scores for running the board.
 *
 * Capturing an idea, scheduling a session and tidying the backlog are the organiser's
 * admin, so they are deliberately worth nothing. Counting them would let whoever
 * maintains the tool out-score the people actually standing up and presenting.
 */
export const XP = {
  /** Someone put their name to it. */
  assigned: 3,
  /** It got a date. */
  planned: 5,
  /** They actually gave the talk. */
  presented: 10,
  /** Slides *and* a recording, so it outlives the room. */
  archivist: 5,
} as const;

/** What a subject is worth to each of its speakers, right now. */
export function subjectXp(subject: Subject): number {
  const archived = subject.status === "archived";
  const delivered = subject.status === "presented" ||
    (archived && subject.sessionDate !== null);

  if (delivered) {
    const bonus = subject.slidesUrl && subject.recordingUrl ? XP.archivist : 0;
    // A bounty is collected once, by whoever actually delivered it.
    return XP.presented + bonus + subject.bounty;
  }

  if (subject.status === "planned") return XP.planned;
  if (subject.status === "assigned") return XP.assigned;
  return 0;
}

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

export interface Season {
  /** e.g. "2026-Q3" */
  key: string;
  label: string;
  start: string;
  /** Exclusive. */
  end: string;
}

function quarterOf(iso: string): number {
  return Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;
}

export function seasonFor(iso: string): Season {
  const year = Number(iso.slice(0, 4));
  const q = quarterOf(iso);
  const startMonth = (q - 1) * 3 + 1;
  const endYear = q === 4 ? year + 1 : year;
  const endMonth = q === 4 ? 1 : startMonth + 3;

  return {
    key: `${year}-Q${q}`,
    label: `${year} Q${q}`,
    start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    end: `${endYear}-${String(endMonth).padStart(2, "0")}-01`,
  };
}

export function currentSeason(): Season {
  return seasonFor(today());
}

export function previousSeason(): Season {
  const c = currentSeason();
  // One day before the season start lands in the previous quarter.
  const d = new Date(`${c.start}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return seasonFor(d.toISOString().slice(0, 10));
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export interface Standing {
  personId: number;
  name: string;
  xp: number;
  talks: number;
  /** Presented subjects that have both slides and a recording. */
  archived: number;
  /** Bounty XP collected. */
  bounty: number;
  areas: TechArea[];
  lastPresented: string | null;
}

interface Window {
  /** Inclusive ISO date. Subjects presented before this don't count. */
  from?: string;
  /** Exclusive ISO date. */
  to?: string;
  /**
   * Count only talks actually delivered inside the window.
   *
   * Defaults on for a closed window (a specific season), because an undated
   * commitment has no date to fall inside it — without this, work someone merely
   * signed up for would inflate *every* past season and corrupt the trophy.
   * The open-ended rolling board leaves it off, so current commitments still show.
   */
  deliveredOnly?: boolean;
}

/** ISO date exactly `months` before today. */
export function monthsAgo(months: number): string {
  const d = new Date(`${today()}T00:00:00`);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Standings over a window of session dates.
 *
 * Rolling by default rather than all-time: an all-time board gets locked up by
 * whoever started early and stops motivating everyone else within a year.
 */
export async function leaderboard(window: Window = {}): Promise<Standing[]> {
  const from = window.from ?? monthsAgo(12);
  const to = window.to;
  const deliveredOnly = window.deliveredOnly ?? to !== undefined;

  const [subjects, tags] = await Promise.all([
    listSubjects({ includeArchived: true }),
    db.selectFrom("subject_tags").selectAll().execute(),
  ]);

  const tagsBySubject = new Map<number, TechArea[]>();
  for (const t of tags) {
    const list = tagsBySubject.get(t.subject_id) ?? [];
    list.push(t.tag as TechArea);
    tagsBySubject.set(t.subject_id, list);
  }

  const byPerson = new Map<number, Standing>();

  for (const subject of subjects) {
    // Undated work still earns commitment XP; only *delivery* is windowed, because
    // that is what has a date attached.
    const date = subject.sessionDate;
    if (date && (date < from || (to && date >= to))) continue;

    const delivered = subject.status === "presented" ||
      (subject.status === "archived" && date !== null);

    if (deliveredOnly && (!delivered || !date)) continue;

    const xp = subjectXp(subject);
    if (xp === 0 && subject.people.length === 0) continue;

    for (const person of subject.people) {
      const s = byPerson.get(person.id) ?? {
        personId: person.id,
        name: person.name,
        xp: 0,
        talks: 0,
        archived: 0,
        bounty: 0,
        areas: [],
        lastPresented: null,
      };

      s.xp += xp;
      if (delivered) {
        s.talks += 1;
        s.bounty += subject.bounty;
        if (subject.slidesUrl && subject.recordingUrl) s.archived += 1;
        if (date && (!s.lastPresented || date > s.lastPresented)) {
          s.lastPresented = date;
        }
      }

      // Only delivered talks count towards someone's areas, so "areas" means the
      // same thing here as it does on the radar. A tag on an unstarted idea is an
      // intention, not coverage.
      if (delivered) {
        for (const area of tagsBySubject.get(subject.id) ?? []) {
          if (!s.areas.includes(area)) s.areas.push(area);
        }
      }

      byPerson.set(person.id, s);
    }
  }

  return [...byPerson.values()].sort((a, b) =>
    b.xp - a.xp || b.talks - a.talks || a.name.localeCompare(b.name)
  );
}

/** Whoever topped the last completed quarter — the one holding the trophy. */
export async function trophyHolder(): Promise<
  { season: Season; champion: Standing | null }
> {
  const season = previousSeason();
  const standings = await leaderboard({ from: season.start, to: season.end });
  const withTalks = standings.filter((s) => s.talks > 0);
  return { season, champion: withTalks[0] ?? null };
}

// ---------------------------------------------------------------------------
// Season progress (company-wide)
// ---------------------------------------------------------------------------

export interface SeasonProgress {
  season: Season;
  /** XP earned by speakers for talks delivered this season. */
  xp: number;
  /** A round number to aim at, so the bar has an end. */
  target: number;
  talks: number;
  /** Distinct people who presented this season. */
  speakers: number;
  /** Ideas captured this season. A count, deliberately not XP. */
  subjectsAdded: number;
}

export async function seasonProgress(): Promise<SeasonProgress> {
  const season = currentSeason();
  const subjects = await listSubjects({ includeArchived: true });

  let xp = 0;
  let talks = 0;
  let speakers = 0;
  let subjectsAdded = 0;

  const spoke = new Set<number>();

  for (const s of subjects) {
    // Ideas captured this season are reported as a count, never as XP: writing one
    // down is the organiser's job, and it should not out-score giving a talk.
    const created = s.createdAt.slice(0, 10);
    if (created >= season.start && created < season.end) subjectsAdded += 1;

    const date = s.sessionDate;
    if (!date || date < season.start || date >= season.end) continue;
    if (s.status !== "presented" && s.status !== "archived") continue;

    talks += 1;
    // Each speaker earns the full value, so the bar is the sum of what the people
    // who presented actually earned — it matches the leaderboard for this season.
    xp += subjectXp(s) * Math.max(1, s.people.length);
    for (const p of s.people) spoke.add(p.id);
  }

  speakers = spoke.size;

  // Roughly six solid talks in a quarter.
  const target = 100;
  return { season, xp, target, talks, speakers, subjectsAdded };
}

// ---------------------------------------------------------------------------
// Tech radar
// ---------------------------------------------------------------------------

export interface AreaCoverage {
  area: TechArea;
  /** Talks actually given in this area. */
  presented: number;
  /** Scheduled or claimed, not yet delivered. */
  upcoming: number;
  /** Most recent session date for a delivered talk here. */
  lastCovered: string | null;
}

export async function radar(): Promise<AreaCoverage[]> {
  const [subjects, tags] = await Promise.all([
    listSubjects({ includeArchived: true }),
    db.selectFrom("subject_tags").selectAll().execute(),
  ]);

  const byId = new Map(subjects.map((s) => [s.id, s]));
  const coverage = new Map<TechArea, AreaCoverage>(
    TECH_AREAS.map((
      area,
    ) => [area, { area, presented: 0, upcoming: 0, lastCovered: null }]),
  );

  for (const t of tags) {
    const subject = byId.get(t.subject_id);
    const entry = coverage.get(t.tag as TechArea);
    if (!subject || !entry) continue;

    const delivered = subject.status === "presented" ||
      subject.status === "archived";

    if (delivered) {
      entry.presented += 1;
      const date = subject.sessionDate;
      if (date && (!entry.lastCovered || date > entry.lastCovered)) {
        entry.lastCovered = date;
      }
    } else {
      entry.upcoming += 1;
    }
  }

  return [...coverage.values()];
}

// ---------------------------------------------------------------------------
// Roulette
// ---------------------------------------------------------------------------

export interface RouletteCandidate {
  personId: number;
  name: string;
  lastPresented: string | null;
  monthsSince: number | null;
}

/**
 * Everyone who hasn't presented in the last `months` — the pool to spin over.
 * Someone who has never presented is in, and sorts first.
 */
export async function rouletteCandidates(
  months = 6,
): Promise<RouletteCandidate[]> {
  const [people, subjects] = await Promise.all([
    db.selectFrom("people").selectAll().orderBy("name").execute(),
    listSubjects({ includeArchived: true }),
  ]);

  const lastByPerson = new Map<number, string>();
  for (const s of subjects) {
    const delivered = s.status === "presented" || s.status === "archived";
    if (!delivered || !s.sessionDate) continue;
    for (const p of s.people) {
      const current = lastByPerson.get(p.id);
      if (!current || s.sessionDate > current) {
        lastByPerson.set(p.id, s.sessionDate);
      }
    }
  }

  const cutoff = monthsAgo(months);

  return people
    .map((p) => {
      const last = lastByPerson.get(p.id) ?? null;
      return {
        personId: p.id,
        name: p.name,
        lastPresented: last,
        monthsSince: last ? monthsBetween(last, today()) : null,
      };
    })
    .filter((c) => c.lastPresented === null || c.lastPresented < cutoff)
    .sort((a, b) =>
      (b.monthsSince ?? Infinity) - (a.monthsSince ?? Infinity) ||
      a.name.localeCompare(b.name)
    );
}

function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return (b.getFullYear() - a.getFullYear()) * 12 +
    (b.getMonth() - a.getMonth());
}

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------

/** Unclaimed subjects carrying a bounty, richest first. */
export async function openBounties(): Promise<Subject[]> {
  const subjects = await listSubjects();
  return subjects
    .filter((s) =>
      s.bounty > 0 && s.people.length === 0 &&
      s.status !== "presented" && s.status !== "archived"
    )
    .sort((a, b) => b.bounty - a.bounty);
}

export function statusIsDelivered(status: SubjectStatus): boolean {
  return status === "presented" || status === "archived";
}
