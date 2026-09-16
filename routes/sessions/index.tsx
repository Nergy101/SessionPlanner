import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  createSession,
  formatLongDate,
  isPast,
  listSessions,
  nextThursday,
} from "@/services/sessions.ts";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import NewSession from "@/islands/NewSession.tsx";
import {
  createSubject,
  findSubjectByTitle,
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
    { session }: { session: typeof upcoming[number] },
  ) => (
    <div
      class={`mb-2 flex gap-4 rounded-lg border border-dashed border-slate-300 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md dark:border-slate-600 dark:bg-slate-900 ${
        isPast(session.date) ? "opacity-75" : ""
      }`}
    >
      <div class="flex shrink-0 basis-17 flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 py-1.5 font-mono dark:border-slate-700 dark:bg-slate-800">
        <span class="text-2xl font-bold leading-none text-slate-900 dark:text-slate-100">
          {Number(session.date.slice(8, 10))}
        </span>
        <span class="text-[0.62rem] uppercase tracking-widest text-slate-600 dark:text-slate-400">
          {new Date(`${session.date}T00:00:00`).toLocaleDateString("en-GB", {
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex items-center justify-between gap-4">
          <a
            href={`/sessions/${session.id}`}
            class="font-mono text-sm font-semibold text-slate-900 no-underline hover:text-brand dark:text-slate-100"
          >
            {formatLongDate(session.date)}
          </a>
          <span class="ui-badge ui-badge-idea">
            {session.subjects.length}{" "}
            subject{session.subjects.length === 1 ? "" : "s"}
          </span>
        </div>

        {session.notes && (
          <p class="mt-1 truncate text-[0.8rem] text-slate-600 dark:text-slate-400">
            {session.notes}
          </p>
        )}

        {session.subjects.length > 0 && (
          <div class="mt-2 flex flex-wrap gap-1.5">
            {session.subjects.map((s) => (
              <a key={s.id} href={`/subjects/${s.id}`} class="ui-chip">
                <StatusBadge status={s.status} />
                {s.title}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div class="mb-6">
        <h1 class="text-2xl">sessions</h1>
        <p class="mt-1 max-w-2xl text-slate-600 dark:text-slate-400">
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
          ? upcoming.map((s) => <Row key={s.id} session={s} />)
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
          ? past.map((s) => <Row key={s.id} session={s} />)
          : <div class="ui-empty">Nothing yet.</div>}
      </section>
    </>
  );
});
