import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { agendaText, amsterdamToUtc, sessionIcs } from "@/services/calendar.ts";
import type { Session } from "@/services/sessions.ts";
import type { Subject } from "@/services/subjects.ts";

const subject = (title: string, names: string[]) =>
  ({
    title,
    people: names.map((name, id) => ({ id, name, created_at: "" })),
  }) as unknown as Subject;

const session: Session = {
  id: 14,
  date: "2026-10-15",
  startTime: "16:00",
  notes: "Big room; pizza, drinks",
  subjects: [
    subject("Testcontainers in CI", ["Jan", "Sanne"]),
    subject("OpenTelemetry", []),
  ],
  links: [],
};

Deno.test("the agenda text lists the running order", () => {
  assertEquals(
    agendaText(session),
    [
      "Session #14 · Thursday, 15 October 2026 · 16:00",
      "",
      "1. Testcontainers in CI — Jan & Sanne",
      "2. OpenTelemetry — speaker to be confirmed",
      "",
      "Big room; pizza, drinks",
    ].join("\n"),
  );
});

Deno.test("Amsterdam wall-clock time converts across daylight saving", () => {
  assertEquals(
    amsterdamToUtc("2026-07-01", "16:00").toISOString(),
    "2026-07-01T14:00:00.000Z",
  );
  assertEquals(
    amsterdamToUtc("2026-12-01", "16:00").toISOString(),
    "2026-12-01T15:00:00.000Z",
  );
});

Deno.test("a timed session becomes a one-hour UTC event", () => {
  const ics = sessionIcs(session, "https://example.com/sessions/14");
  assertStringIncludes(ics, "DTSTART:20261015T140000Z\r\n");
  assertStringIncludes(ics, "DTEND:20261015T150000Z\r\n");
  assertStringIncludes(ics, "pizza\\, drinks");
  assertStringIncludes(
    sessionIcs({ ...session, notes: "C:\\temp" }, "https://x.test"),
    "C:\\\\temp",
  );
  assert(ics.split("\r\n").every((line) => line.length <= 75));
});

Deno.test("a session without a time is an all-day event", () => {
  const ics = sessionIcs({ ...session, startTime: null }, "https://x.test");
  assertStringIncludes(ics, "DTSTART;VALUE=DATE:20261015\r\n");
  assertStringIncludes(ics, "DTEND;VALUE=DATE:20261016\r\n");
});
