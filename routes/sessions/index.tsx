import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  createSession,
  formatLongDate,
  isPast,
  listSessions,
  nextThursday,
  type Session,
  SESSION_SLOTS,
} from "@/services/sessions.ts";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import NewSession from "@/islands/NewSession.tsx";
import {
  createSubject,
  findSubjectByTitle,
  linkLabel,
  listSchedulable,
  setSubjectPeople,
  setSubjectSession,
} from "@/services/subjects.ts";
import { listPeople } from "@/services/people.ts";

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

    const id = await createSession(date, String(form.get("notes") ?? ""));

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
  const { upcoming, past, defaultDate, pool, people } = data;

  const Row = (
    { session, past: isOld }: { session: Session; past: boolean },
  ) => {
    const open = Math.max(0, SESSION_SLOTS - session.subjects.length);
    return (
      <article
        class={`ui-card ${isOld ? "opacity-75" : ""}`}
      >
        <div class="flex gap-3">
          {/* The date block: yellow when it is the next thing on the calendar, plain otherwise. */}
          <a
            href={`/sessions/${session.id}`}
            class={`flex w-[58px] shrink-0 flex-col items-center justify-center border border-line py-1.5 no-underline ${
              isOld ? "bg-surface-2 text-text" : "bg-primary text-[#111]"
            }`}
            aria-label={`Open ${formatLongDate(session.date)}`}
          >
            <span class="text-2xl font-bold leading-none">
              {Number(session.date.slice(8, 10))}
            </span>
            <span class="text-[0.62rem] uppercase tracking-widest">
              {new Date(`${session.date}T00:00:00`).toLocaleDateString(
                "en-GB",
                {
                  month: "short",
                  year: "numeric",
                },
              )}
            </span>
          </a>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <a
                href={`/sessions/${session.id}`}
                class="font-bold text-text no-underline hover:underline"
              >
                {formatLongDate(session.date)}
              </a>
              <span class="ui-hint">
                {session.subjects.length}/{SESSION_SLOTS} slots
              </span>
            </div>

            {session.notes && (
              <p class="ui-hint mt-1 truncate">{session.notes}</p>
            )}

            <ul class="mt-2 flex flex-col gap-1.5">
              {session.subjects.map((s) => (
                <li key={s.id} class="flex min-w-0 items-center gap-2">
                  <StatusBadge stage={s.stage} />
                  <a
                    href={`/subjects/${s.id}`}
                    class="min-w-0 truncate text-text no-underline hover:underline"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
              {Array.from({ length: open }, (_, i) => (
                <li key={`open-${i}`}>
                  <a
                    href={`/sessions/${session.id}`}
                    class="ui-hint block border border-dashed border-line px-2 py-1 no-underline hover:text-text"
                  >
                    + open slot
                  </a>
                </li>
              ))}
            </ul>

            {session.links.length > 0 && (
              <div class="mt-2 flex flex-wrap gap-1.5">
                {session.links.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ui-chip"
                  >
                    {linkLabel(l)} ↗
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </article>
    );
  };

  return (
    <>
      <div class="mb-6">
        <h1 class="text-3xl tracking-tight">sessions</h1>
        <p class="mt-1 max-w-2xl text-muted">
          The dates, and what's planned for each one.
        </p>
      </div>

      <NewSession
        defaultDate={defaultDate}
        pool={pool}
        people={people}
      />

      <section class="mb-9">
        <div class="ui-section-head">
          <h2>upcoming</h2>
        </div>
        {upcoming.length
          ? (
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {upcoming.map((s) => <Row key={s.id} session={s} past={false} />)}
            </div>
          )
          : (
            <div class="ui-empty">
              No sessions scheduled. Pick a date above.
            </div>
          )}
      </section>

      <section>
        <div class="ui-section-head">
          <h2>past</h2>
          <span class="ui-hint">what the team has already shared</span>
        </div>
        {past.length
          ? (
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {past.map((s) => <Row key={s.id} session={s} past />)}
            </div>
          )
          : <div class="ui-empty">Nothing yet.</div>}
      </section>
    </>
  );
});
