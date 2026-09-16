import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  createSubject,
  getSubject,
  listSchedulable,
  setSubjectPeople,
  setSubjectSession,
} from "@/services/subjects.ts";
import {
  daysAway,
  formatShortDate,
  getUpcomingSessions,
  type Session,
} from "@/services/sessions.ts";
import { SubjectCard } from "@/components/SubjectCard.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";
import { normalizeName } from "@/services/people.ts";
import AutoSubmitSelect from "@/islands/AutoSubmitSelect.tsx";
import PeoplePicker from "@/islands/PeoplePicker.tsx";

/** How many upcoming sessions the dashboard lists before deferring to /sessions. */
const UPCOMING_LIMIT = 5;

export const handler = define.handlers({
  async GET(ctx) {
    const [upcoming, pool] = await Promise.all([
      getUpcomingSessions(),
      listSchedulable(),
    ]);
    return page({
      upcoming: upcoming.slice(0, UPCOMING_LIMIT),
      // Every future date, not just the listed ones, is a valid slot to fill.
      slots: upcoming.map((s) => ({
        value: String(s.id),
        label: formatShortDate(s.date),
      })),
      ready: pool.filter((s) => s.status === "assigned"),
      ideas: pool.filter((s) => s.status === "idea"),
      added: ctx.url.searchParams.get("added"),
      scheduled: ctx.url.searchParams.get("scheduled"),
      speaker: ctx.url.searchParams.get("speaker"),
    });
  },

  /**
   * The capture box posts here and comes straight back, so you can fire off several
   * topics in a row. `autofocus` on the box means the redirect lands with the cursor
   * already in it. Flesh a topic out later, from its own page.
   *
   * The ready-to-schedule cards post here too, with `intent=schedule`, and the
   * needs-a-speaker cards with `intent=speaker`.
   */
  async POST(ctx) {
    const form = await ctx.req.formData();

    if (form.get("intent") === "schedule") {
      const subjectId = Number(form.get("subject"));
      const sessionId = Number(form.get("session"));
      // Only future sessions are on offer, so only accept those.
      const session = (await getUpcomingSessions()).find((s) =>
        s.id === sessionId
      );
      if (!subjectId || !session) return ctx.redirect("/", 303);

      await setSubjectSession(subjectId, sessionId);
      return ctx.redirect(
        `/?scheduled=${encodeURIComponent(formatShortDate(session.date))}`,
        303,
      );
    }

    if (form.get("intent") === "speaker") {
      const subject = await getSubject(Number(form.get("subject")));
      const added = form.getAll("people").map((n) => normalizeName(String(n)))
        .filter(Boolean);
      if (!subject || !added.length) return ctx.redirect("/", 303);

      // Add to whoever is already on it; never drop an existing speaker.
      await setSubjectPeople(subject.id, [
        ...subject.people.map((p) => p.name),
        ...added,
      ]);
      return ctx.redirect(
        `/?speaker=${encodeURIComponent(added.join(", "))}`,
        303,
      );
    }

    const title = String(form.get("title") ?? "").trim();
    if (!title) return ctx.redirect("/", 303);

    await createSubject(title);
    return ctx.redirect(`/?added=${encodeURIComponent(title)}`, 303);
  },
});

export default define.page<typeof handler>(function Dashboard({ data }) {
  const { upcoming, slots, ready, ideas, added, scheduled, speaker } = data;

  return (
    <>
      <div class="mb-6">
        <h1 class="text-2xl">dashboard</h1>
        <p class="mt-1 max-w-2xl text-slate-600 dark:text-slate-400">
          What's coming up, and what still needs a speaker or a date.
        </p>
      </div>

      <div class="mb-9">
        <QuickAdd
          action="/"
          autofocus
          placeholder="heard a good topic? type it here…"
          label="capture"
        />
        {added && (
          <p class="ui-hint mt-2">
            added{" "}
            <strong class="text-slate-900 dark:text-slate-100">{added}</strong>
            {" "}
            — keep typing to add another.
          </p>
        )}
      </div>

      <section class="mb-9">
        <div class="ui-section-head">
          <h2>upcoming sessions</h2>
          <a href="/sessions" class="ui-hint no-underline hover:text-brand">
            all sessions →
          </a>
        </div>

        {upcoming.length
          ? (
            <div class="ui-table-wrap">
              {upcoming.map((s, i) => (
                <UpcomingRow key={s.id} session={s} first={i === 0} />
              ))}
            </div>
          )
          : (
            <div class="ui-empty">
              No session scheduled yet. <a href="/sessions">Pick a date</a>{" "}
              to start planning one.
            </div>
          )}
      </section>

      <section class="mb-9">
        <div class="ui-section-head">
          <h2>ready to schedule</h2>
          <span class="ui-hint">has a speaker, needs a date</span>
        </div>
        {scheduled && (
          <p class="ui-hint -mt-2 mb-3">
            scheduled on{" "}
            <strong class="text-slate-900 dark:text-slate-100">
              {scheduled}
            </strong>.
          </p>
        )}
        {ready.length
          ? (
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ready.map((s) => (
                <SubjectCard key={s.id} subject={s}>
                  {slots.length
                    ? (
                      <form method="post" action="/">
                        <input type="hidden" name="intent" value="schedule" />
                        <input type="hidden" name="subject" value={s.id} />
                        <AutoSubmitSelect
                          name="session"
                          value=""
                          ariaLabel={`Schedule ${s.title} on a session`}
                          class="ui-select py-1 text-xs"
                          options={[
                            { value: "", label: "schedule on…" },
                            ...slots,
                          ]}
                        />
                      </form>
                    )
                    : (
                      <a
                        href="/sessions"
                        class="ui-hint no-underline hover:text-brand"
                      >
                        no upcoming sessions — add one →
                      </a>
                    )}
                </SubjectCard>
              ))}
            </div>
          )
          : (
            <div class="ui-empty">
              Nothing waiting for a date. Find speakers for the ideas below.
            </div>
          )}
      </section>

      <section>
        <div class="ui-section-head">
          <h2>needs a speaker</h2>
          <span class="ui-hint">ideas nobody has picked up yet</span>
        </div>
        {speaker && (
          <p class="ui-hint -mt-2 mb-3">
            <strong class="text-slate-900 dark:text-slate-100">
              {speaker}
            </strong>{" "}
            is on it — it's now under ready to schedule.
          </p>
        )}
        {ideas.length
          ? (
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ideas.map((s) => (
                <SubjectCard key={s.id} subject={s}>
                  <form method="post" action="/">
                    <input type="hidden" name="intent" value="speaker" />
                    <input type="hidden" name="subject" value={s.id} />
                    <PeoplePicker
                      initial={[]}
                      autoSubmit
                      placeholder="assign a speaker…"
                      inputClass="ui-input py-1 text-xs"
                    />
                  </form>
                </SubjectCard>
              ))}
            </div>
          )
          : <div class="ui-empty">No loose ideas. Capture one above.</div>}
      </section>
    </>
  );
});

/** One line per session: the date on the left, what's on it to the right. */
function UpcomingRow({ session, first }: { session: Session; first: boolean }) {
  const date = new Date(`${session.date}T00:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "short", day: "numeric", month: "short" },
  );

  return (
    <div
      class={`flex flex-col gap-1.5 border-b border-dashed border-slate-200 px-3 py-2.5 last:border-b-0 sm:flex-row sm:gap-4 dark:border-slate-700/70 ${
        first ? "bg-brand/5" : ""
      }`}
    >
      <div class="flex shrink-0 items-baseline gap-2 sm:w-40 sm:flex-col sm:gap-0">
        <a
          href={`/sessions/${session.id}`}
          class="font-mono text-sm font-semibold text-slate-900 no-underline hover:text-brand dark:text-slate-100"
        >
          {date}
        </a>
        <span class={`ui-hint ${first ? "text-brand dark:text-brand" : ""}`}>
          {daysAway(session.date)}
        </span>
      </div>

      <div class="min-w-0 flex-1">
        {session.subjects.length
          ? (
            <ul class="flex flex-col gap-1">
              {session.subjects.map((s) => (
                <li
                  key={s.id}
                  class="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                >
                  <a
                    href={`/subjects/${s.id}`}
                    class="font-mono text-[0.8rem] text-slate-900 no-underline hover:text-brand dark:text-slate-100"
                  >
                    {s.title}
                  </a>
                  {s.people.length
                    ? (
                      <span class="ui-hint">
                        {s.people.map((p) => p.name).join(", ")}
                      </span>
                    )
                    : (
                      <span class="ui-badge ui-badge-danger">
                        needs a speaker
                      </span>
                    )}
                </li>
              ))}
            </ul>
          )
          : (
            <a
              href={`/sessions/${session.id}`}
              class="ui-hint italic no-underline hover:text-brand"
            >
              nothing planned yet — add a topic
            </a>
          )}
      </div>
    </div>
  );
}
