import { formatLongDate, type Session } from "./sessions.ts";

/** Calendar events get this length; nothing in the planner records an end. */
const EVENT_MINUTES = 60;

/** The title line, e.g. "Session #14 · Thursday 15 October 2026 · 16:00". */
export function sessionHeading(session: Session): string {
  return [
    `Session #${session.id}`,
    formatLongDate(session.date),
    session.startTime,
  ].filter(Boolean).join(" · ");
}

/** The running order as plain text, for pasting into chat or e-mail. */
export function agendaText(session: Session): string {
  const items = session.subjects.map((s, i) => {
    const speakers = s.people.map((p) => p.name).join(" & ");
    return `${i + 1}. ${s.title} — ${speakers || "speaker to be confirmed"}`;
  });
  return [
    sessionHeading(session),
    "",
    ...(items.length ? items : ["Nothing planned yet."]),
    ...(session.notes ? ["", session.notes] : []),
  ].join("\n");
}

/** A calendar file holding the session as its one event. */
export function sessionIcs(session: Session, pageUrl: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//session-planner//EN",
    "CALSCALE:GREGORIAN",
    ...sessionEvent(session, pageUrl),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/**
 * With a start time the event lasts EVENT_MINUTES; without one it is an
 * all-day event on the date.
 */
function sessionEvent(session: Session, pageUrl: string): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:session-${session.id}@session-planner`,
    `DTSTAMP:${icsUtc(new Date())}`,
    ...eventTimes(session),
    `SUMMARY:${icsText(sessionHeading(session))}`,
    `DESCRIPTION:${icsText(agendaText(session))}`,
    `URL:${pageUrl}`,
    "END:VEVENT",
  ];
}

export function icsFilename(session: Session): string {
  return `session-${session.id}-${session.date}.ics`;
}

function eventTimes(session: Session): string[] {
  if (!session.startTime) {
    const next = new Date(`${session.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return [
      `DTSTART;VALUE=DATE:${compactDate(session.date)}`,
      `DTEND;VALUE=DATE:${compactDate(next.toISOString().slice(0, 10))}`,
    ];
  }
  const start = amsterdamToUtc(session.date, session.startTime);
  const end = new Date(start.getTime() + EVENT_MINUTES * 60_000);
  return [`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`];
}

/** A wall-clock time in Amsterdam as the instant it happens. */
export function amsterdamToUtc(date: string, time: string): Date {
  const roughly = new Date(`${date}T${time}:00Z`);
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    timeZoneName: "longOffset",
  }).formatToParts(roughly).find((p) => p.type === "timeZoneName")?.value;
  // "GMT+02:00", or plain "GMT" at a zero offset.
  return new Date(`${date}T${time}:00${offset?.slice(3) || "Z"}`);
}

const compactDate = (iso: string) => iso.replaceAll("-", "");

/** 20261015T140000Z */
const icsUtc = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapes a TEXT value (RFC 5545 §3.3.11). */
const icsText = (value: string) =>
  value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** Folds a content line to at most 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (encoder.encode(current + char).length > 75) {
      parts.push(current);
      current = " ";
    }
    current += char;
  }
  return [...parts, current].join("\r\n");
}
