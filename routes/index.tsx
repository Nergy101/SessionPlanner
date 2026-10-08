import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  createSubject,
  getSubject,
  listSubjects,
  setSubjectPeople,
  setSubjectSession,
  type Stage,
  type Subject,
} from "@/services/subjects.ts";
import {
  daysAway,
  formatShortDate,
  getUpcomingSessions,
  type Session,
  SESSION_SLOTS,
} from "@/services/sessions.ts";
import { SubjectCard } from "@/components/SubjectCard.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";
import { normalizeName } from "@/services/people.ts";
import AutoSubmitSelect from "@/islands/AutoSubmitSelect.tsx";
import PeoplePicker from "@/islands/PeoplePicker.tsx";

/**
 * The four lanes of the board. Each lane is one derived stage: nothing is dragged,
 * a subject moves when its speakers or its session date change.
 */
const LANES: readonly {
  key: Stage;
  label: string;
  hint: string;
  pill: string;
}[] = [
  {
    key: "idea",
    label: "idea",
    hint: "needs a speaker",
    pill: "ui-badge-idea",
  },
  {
    key: "speaker",
    label: "has speaker",
    hint: "needs a session",
    pill: "ui-badge-speaker",
  },
  {
    key: "planned",
    label: "planned",
    hint: "on an upcoming date",
    pill: "ui-badge-planned",
  },
  {
    key: "presented",
    label: "presented",
    hint: "the archive",
    pill: "ui-badge-presented",
  },
];

const isLane = (value: string | null): value is Stage =>
  LANES.some((lane) => lane.key === value);

/**
 * Visitors without the password get this page read-only (see the gate in main.ts):
 * the same lanes, but no capture box, no forms, and no links into the private
 * subject and session pages they'd only bounce off.
 */
export const handler = define.handlers({
  async GET(ctx) {
    const [upcoming, idea, speaker, planned, presented] = await Promise.all([
      getUpcomingSessions(),
      listSubjects({ stage: "idea" }),
      listSubjects({ stage: "speaker" }),
      listSubjects({ stage: "planned" }),
      listSubjects({ stage: "presented" }),
    ]);
    const requested = ctx.url.searchParams.get("lane");

    return page({
      next: upcoming[0] ?? null,
      // Every future date, not just the next one, is a valid slot to fill.
      slots: upcoming.map((s) => ({
        value: String(s.id),
        label: formatShortDate(s.date),
      })),
      lanes: { idea, speaker, planned, presented },
      activeLane: isLane(requested) ? requested : "idea",
      added: ctx.url.searchParams.get("added"),
      scheduled: ctx.url.searchParams.get("scheduled"),
      speakerAdded: ctx.url.searchParams.get("speaker"),
    });
  },

  /**
   * The capture box posts here and comes straight back, so you can fire off several
   * topics in a row. A `@name` token in the capture adds that speaker in the same
   * step. The lane cards post here too: `intent=schedule` puts a speaker's topic on
   * a session, `intent=speaker` adds a speaker to an idea.
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

    const { title, speakers } = parseCapture(String(form.get("title") ?? ""));
    if (!title) return ctx.redirect("/", 303);

    const id = await createSubject(title);
    if (speakers.length) await setSubjectPeople(id, speakers);
    return ctx.redirect(`/?added=${encodeURIComponent(title)}`, 303);
  },
});

/**
 * `Testcontainers in CI @Jan de Vries`: everything before the first `@` is the
 * title, everything after it is one speaker name (so it may contain spaces).
 */
function parseCapture(raw: string) {
  const at = raw.indexOf("@");
  const title = (at === -1 ? raw : raw.slice(0, at)).replace(/\s+/g, " ")
    .trim();
  const speaker = at === -1 ? "" : normalizeName(raw.slice(at + 1));
  return { title, speakers: speaker ? [speaker] : [] };
}

export default define.page<typeof handler>(function Dashboard({ data, state }) {
  const {
    next,
    slots,
    lanes,
    activeLane,
    added,
    scheduled,
    speakerAdded,
  } = data;
  const signedIn = state.signedIn;

  return (
    <>
      <div class="mb-6">
        <h1 class="text-3xl tracking-tight">dashboard</h1>
        <p class="mt-1 max-w-2xl text-muted">
          What's coming up, and where every topic stands.
        </p>
      </div>

      <div class="mb-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        {signedIn
          ? (
            <div class="capture">
              <QuickAdd
                action="/"
                autofocus
                placeholder="Capture an idea… @name for a speaker, ⏎ to add"
                label="Add"
              />
              {added && (
                <p class="ui-hint mt-2">
                  added <strong class="text-text">{added}</strong>{" "}
                  — keep typing to add another.
                </p>
              )}
            </div>
          )
          : (
            <div class="capture">
              <p class="text-muted">
                Read-only.{" "}
                <a href="/login" class="font-semibold text-text">Sign in</a>
                {" "}
                to capture and plan.
              </p>
            </div>
          )}

        <NextSession session={next} />
      </div>

      {(scheduled || speakerAdded) && (
        <p class="ui-hint mb-4">
          {scheduled && (
            <>
              scheduled on <strong class="text-text">{scheduled}</strong>.{" "}
            </>
          )}
          {speakerAdded && (
            <>
              <strong class="text-text">{speakerAdded}</strong>{" "}
              is on it — it's now under has speaker.
            </>
          )}
        </p>
      )}

      <nav class="mb-4 flex flex-wrap gap-2 md:hidden" aria-label="Lanes">
        {LANES.map((lane) => (
          <a
            key={lane.key}
            href={`/?lane=${lane.key}`}
            class={`lane-tab ${
              lane.key === activeLane ? "lane-tab-active" : ""
            }`}
            aria-current={lane.key === activeLane ? "page" : undefined}
          >
            {lane.label} ({lanes[lane.key].length})
          </a>
        ))}
      </nav>

      <div class="board">
        {LANES.map((lane) => {
          const items = lanes[lane.key];
          const isActive = lane.key === activeLane;
          return (
            <section
              key={lane.key}
              class={`lane ${isActive ? "" : "hidden"} md:flex`}
              aria-labelledby={`lane-${lane.key}`}
            >
              <div class="lane-head">
                <div>
                  <h2 id={`lane-${lane.key}`} class="sr-only">{lane.label}</h2>
                  <span class={`ui-badge ${lane.pill}`}>{lane.label}</span>
                  <p class="ui-hint mt-1">{lane.hint}</p>
                </div>
                <span class="lane-count">{items.length}</span>
              </div>

              {items.length
                ? items.map((subject) => (
                  <SubjectCard
                    key={subject.id}
                    subject={subject}
                    linked={signedIn}
                  >
                    {signedIn && (
                      <LaneAction
                        lane={lane.key}
                        subject={subject}
                        slots={slots}
                      />
                    )}
                  </SubjectCard>
                ))
                : (
                  <div class="ui-empty">
                    {emptyText(lane.key, signedIn)}
                  </div>
                )}
            </section>
          );
        })}
      </div>

      <p class="mt-6">
        <a href="/sessions" class="ui-hint hover:text-text">
          all sessions →
        </a>
      </p>
    </>
  );
});

function emptyText(lane: Stage, signedIn: boolean): string {
  switch (lane) {
    case "idea":
      return signedIn
        ? "No loose ideas. Capture one above."
        : "No loose ideas.";
    case "speaker":
      return "Nothing waiting for a date. Find speakers for the ideas.";
    case "planned":
      return "Nothing on an upcoming session yet.";
    case "presented":
      return "No presented topics yet.";
  }
}

/** The next upcoming session with its slots: filled squares are taken. */
function NextSession({ session }: {
  session: Session | null;
}) {
  if (!session) {
    return (
      <div class="next-strip">
        <p class="font-display text-lg font-bold">No upcoming session</p>
        <a href="/sessions" class="ui-hint text-[#111] underline">
          add a date →
        </a>
      </div>
    );
  }

  const filled = session.subjects.length;
  const open = Math.max(SESSION_SLOTS - filled, 0);

  return (
    <a href={`/sessions/${session.id}`} class="next-strip no-underline">
      <p class="ui-eyebrow text-[#111]">
        Next · {formatShortDate(session.date)}
      </p>
      <p class="mt-1 font-display text-lg font-bold">
        {filled} of {SESSION_SLOTS} slots · {daysAway(session.date)}
      </p>
      <div class="mt-2 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: SESSION_SLOTS }, (_, i) => (
          <span
            key={i}
            class={`slot ${i < filled ? "slot-filled" : "slot-open"}`}
          />
        ))}
      </div>
      <span class="sr-only">{open} open</span>
    </a>
  );
}

/** The one next-step form on a lane card. Each stage has exactly one. */
function LaneAction({ lane, subject, slots }: {
  lane: Stage;
  subject: Subject;
  slots: { value: string; label: string }[];
}) {
  if (lane === "idea") {
    return (
      <form method="post" action="/">
        <input type="hidden" name="intent" value="speaker" />
        <input type="hidden" name="subject" value={subject.id} />
        <PeoplePicker
          initial={[]}
          autoSubmit
          placeholder="assign a speaker…"
          inputClass="ui-input py-1 text-xs"
        />
      </form>
    );
  }

  if (lane === "speaker") {
    if (!slots.length) {
      return (
        <a href="/sessions" class="ui-hint hover:text-text">
          no upcoming sessions — add one →
        </a>
      );
    }
    return (
      <form method="post" action="/">
        <input type="hidden" name="intent" value="schedule" />
        <input type="hidden" name="subject" value={subject.id} />
        <AutoSubmitSelect
          name="session"
          value=""
          ariaLabel={`Schedule ${subject.title} on a session`}
          class="ui-select py-1 text-xs"
          options={[{ value: "", label: "schedule on…" }, ...slots]}
        />
      </form>
    );
  }

  return null;
}
