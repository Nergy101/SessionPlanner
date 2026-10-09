import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  createSession,
  daysAway,
  formatShortDate,
  isPast,
  listSessions,
  nextThursday,
  parseTime,
  type Session,
  SESSION_SLOTS,
} from "@/services/sessions.ts";
import { Avatar } from "@/components/Avatar.tsx";
import NewSession from "@/islands/NewSession.tsx";
import {
  createSubject,
  findSubjectByTitle,
  listSchedulable,
  setSubjectPeople,
  setSubjectSession,
} from "@/services/subjects.ts";
import { listPeople } from "@/services/people.ts";

/** Sessions usually start late afternoon; prefilled, and clearable. */
const DEFAULT_START = "16:00";

export const handler = define.handlers({
  async GET() {
    const [all, pool, people] = await Promise.all([
      listSessions(),
      listSchedulable(),
      listPeople(),
    ]);
    return page({
      pool: pool.map((s) => ({
        title: s.title,
        speakers: s.people.map((p) => p.name),
      })),
      people: people.map((p) => p.name),
      upcoming: all.filter((s) => !isPast(s.date)).sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
      past: all.filter((s) => isPast(s.date)),
      defaultDate: nextThursday(),
      defaultTime: DEFAULT_START,
    });
  },

  /**
   * Book the date, and in the same submit optionally put a topic on it and a speaker
   * on the topic — the three things that otherwise take three separate screens.
   */
  async POST(ctx) {
    const form = await ctx.req.formData();
    const date = String(form.get("date") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return ctx.redirect("/sessions", 303);
    }

    const id = await createSession(
      date,
      String(form.get("notes") ?? ""),
      parseTime(form.get("time")),
    );

    const title = String(form.get("subjectTitle") ?? "").trim();
    if (title) {
      // A typed title that matches something in the backlog schedules *that*
      // subject rather than creating a near-duplicate of it.
      const existing = await findSubjectByTitle(title);
      const subjectId = existing?.id ?? await createSubject(title, id);
      if (existing) await setSubjectSession(existing.id, id);

      // Only fill a vacancy: never overwrite speakers who are already on it.
      const speaker = String(form.get("speaker") ?? "").trim();
      if (speaker && (existing?.people.length ?? 0) === 0) {
        await setSubjectPeople(subjectId, [speaker]);
      }
    }

    return ctx.redirect(`/sessions/${id}`, 303);
  },
});

export default define.page<typeof handler>(function Sessions({ data }) {
  const { upcoming, past, defaultDate, defaultTime, pool, people } = data;

  return (
    <>
      <header class="page-head">
        <h1>Sessions</h1>
        <p class="page-sub">
          {upcoming.length} upcoming · {past.length} past
        </p>
      </header>

      <NewSession
        defaultDate={defaultDate}
        defaultTime={defaultTime}
        pool={pool}
        people={people}
      />

      <section class="mt-6">
        <h2 class="ui-eyebrow mb-3">Upcoming</h2>
        {upcoming.length
          ? (
            <div class="card-grid">
              {upcoming.map((s) => <UpcomingCard key={s.id} session={s} />)}
            </div>
          )
          : (
            <div class="ui-empty">
              No sessions scheduled. Pick a date above.
            </div>
          )}
      </section>

      <section class="mt-8">
        <h2 class="ui-eyebrow mb-3">Past</h2>
        {past.length
          ? (
            <div class="ui-card overflow-hidden p-0">
              {past.map((s) => <PastRow key={s.id} session={s} />)}
            </div>
          )
          : <div class="ui-empty">Nothing yet.</div>}
      </section>
    </>
  );
});

/** "15" and "Oct" for the yellow date block. */
function dayAndMonth(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return {
    day: date.getDate(),
    month: date.toLocaleDateString("en-GB", { month: "short" }),
    weekday: date.toLocaleDateString("en-GB", { weekday: "short" }),
  };
}

function UpcomingCard({ session }: { session: Session }) {
  const { day, month, weekday } = dayAndMonth(session.date);
  const open = Math.max(0, SESSION_SLOTS - session.subjects.length);

  return (
    <article class="ui-card flex flex-col gap-3">
      <a href={`/sessions/${session.id}`} class="session-head">
        <span class="date-block">
          <span class="text-2xl font-bold">{day}</span>
          <span class="text-[11px] font-bold uppercase">{month}</span>
        </span>
        <span class="min-w-0">
          <span class="block font-display text-lg font-bold">
            #{session.id}
          </span>
          <span class="ui-hint">
            {[weekday, session.startTime, daysAway(session.date)]
              .filter(Boolean).join(" · ")}
          </span>
        </span>
      </a>

      {session.notes && <p class="ui-hint truncate">{session.notes}</p>}

      <ul class="flex flex-col gap-2">
        {session.subjects.map((s) => (
          <li key={s.id}>
            <a href={`/subjects/${s.id}`} class="slot-subject">
              <span class="min-w-0 flex-1 truncate font-display font-bold">
                {s.title}
              </span>
              {s.people.slice(0, 2).map((p) => (
                <Avatar key={p.id} name={p.name} stage={s.stage} />
              ))}
              {s.people.length === 0 && (
                <span class="ui-badge ui-badge-danger">no speaker</span>
              )}
            </a>
          </li>
        ))}
        {Array.from({ length: open }, (_, i) => (
          <li key={`open-${i}`}>
            <a href={`/sessions/${session.id}`} class="slot-open-row">
              + open slot
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Past sessions: number, date, what was presented, and whether recordings are in. */
function PastRow({ session }: { session: Session }) {
  const total = session.subjects.length;
  const recorded = session.subjects.filter((s) => s.recordingUrl).length;
  const complete = total > 0 && recorded === total;

  return (
    <a href={`/sessions/${session.id}`} class="ui-row ui-row-past">
      <span class="font-display text-base font-bold">#{session.id}</span>
      <span>{formatShortDate(session.date)}</span>
      <span class="min-w-0 truncate">
        {total
          ? session.subjects.map((s) => s.title).join(" · ")
          : <span class="text-muted">nothing presented</span>}
      </span>
      <span>
        {total > 0 && (
          <span
            class={`ui-badge ${
              complete ? "ui-badge-planned" : "ui-badge-danger"
            }`}
          >
            {recorded}/{total} recordings {complete ? "✓" : "!"}
          </span>
        )}
      </span>
    </a>
  );
}
