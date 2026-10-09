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
  daysUntil,
  formatShortDate,
  getUpcomingSessions,
  type Session,
  SESSION_SLOTS,
} from "@/services/sessions.ts";
import { normalizeName } from "@/services/people.ts";
import { BoardCard } from "@/components/BoardCard.tsx";
import PeoplePicker from "@/islands/PeoplePicker.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";

/**
 * The four lanes of the board. Each lane is one derived stage: nothing is dragged,
 * a subject moves when its speakers or its session date change.
 */
const LANES: readonly { key: Stage; label: string; hint: string }[] = [
  { key: "idea", label: "idea", hint: "needs a speaker" },
  { key: "speaker", label: "has speaker", hint: "needs a session" },
  { key: "planned", label: "planned", hint: "on an upcoming date" },
  { key: "presented", label: "presented", hint: "the archive" },
];

const isLane = (value: string | null): value is Stage =>
  LANES.some((lane) => lane.key === value);

/**
 * Visitors without the password get this page read-only (see the gate in main.ts):
 * the same lanes, but no capture and no next-step controls.
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
      upcoming,
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
    upcoming,
    lanes,
    activeLane,
    added,
    scheduled,
    speakerAdded,
  } = data;
  const signedIn = state.signedIn;
  // The first future session with room left: where "plan →" goes.
  const freeSession = upcoming.find((s) => s.subjects.length < SESSION_SLOTS);

  return (
    <>
      <h1 class="sr-only">Dashboard</h1>

      <div class="top-row">
        {signedIn
          ? (
            <QuickAdd
              action="/"
              autofocus
              placeholder="Capture an idea… ⏎ to add"
              label="Add"
              class="capture"
              inputClass="ui-input capture-input"
            />
          )
          : (
            <div class="capture">
              <span class="capture-input text-muted">
                Sign in to capture an idea…
              </span>
              <a href="/login" class="ui-btn ui-btn-primary">Sign in</a>
            </div>
          )}
        <NextSession session={next} />
      </div>

      {(added || scheduled || speakerAdded) && (
        <p class="ui-hint mt-3">
          {added && (
            <>
              added <strong class="text-text">{added}</strong>{" "}
              — keep typing to add another.{" "}
            </>
          )}
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

      <nav class="lane-tabs mt-4" aria-label="Lanes">
        {LANES.map((lane) => (
          <a
            key={lane.key}
            href={`/?lane=${lane.key}`}
            class={`lane-tab lane-tab-${lane.key}${
              lane.key === activeLane ? " lane-tab-active" : ""
            }`}
            aria-current={lane.key === activeLane ? "page" : undefined}
          >
            {lane.label} ({lanes[lane.key].length})
          </a>
        ))}
      </nav>

      <div class="board mt-4">
        {LANES.map((lane) => {
          const items = lanes[lane.key];
          return (
            <section
              key={lane.key}
              class={`lane${lane.key === activeLane ? "" : " lane-inactive"}`}
              aria-labelledby={`lane-${lane.key}`}
            >
              <div class="lane-head">
                <h2 id={`lane-${lane.key}`} class="sr-only">{lane.label}</h2>
                <span class={`ui-badge ui-badge-${lane.key}`}>
                  {lane.label}
                </span>
                <span class="lane-count">{items.length}</span>
              </div>
              <p class="lane-hint">{lane.hint}</p>

              {items.length
                ? items.map((subject) => (
                  <BoardCard
                    key={subject.id}
                    subject={subject}
                    linked={signedIn}
                  >
                    {signedIn && (
                      <LaneAction
                        lane={lane.key}
                        subject={subject}
                        freeSession={freeSession}
                      />
                    )}
                  </BoardCard>
                ))
                : <div class="ui-empty">{emptyText(lane.key, signedIn)}</div>}
            </section>
          );
        })}
      </div>
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

/** The next upcoming session and how many of its slots are taken. */
function NextSession({ session }: { session: Session | null }) {
  if (!session) {
    return (
      <div class="next-strip">
        <p class="font-display text-base font-bold">No upcoming session</p>
        <a href="/sessions" class="text-sm font-bold underline">
          add a date →
        </a>
      </div>
    );
  }

  const filled = session.subjects.length;

  return (
    <a href={`/sessions/${session.id}`} class="next-strip">
      <span class="font-display text-base font-bold">
        Next · #{session.id} {formatShortDate(session.date)}
        {session.startTime && `, ${session.startTime}`}
      </span>
      <span class="text-sm">
        {filled} of {SESSION_SLOTS} slots · {daysAway(session.date)}
      </span>
      <span class="slot-row" aria-hidden="true">
        {Array.from({ length: SESSION_SLOTS }, (_, i) => (
          <span
            key={i}
            class={`slot ${i < filled ? "slot-filled" : "slot-open"}`}
          />
        ))}
      </span>
    </a>
  );
}

/**
 * The one next-step control on a card; each lane has exactly one. Idea adds a
 * speaker inline, has-speaker plans onto a session, planned links to its session,
 * presented asks for a recording.
 */
function LaneAction({ lane, subject, freeSession }: {
  lane: Stage;
  subject: Subject;
  freeSession: Session | undefined;
}) {
  switch (lane) {
    case "idea":
      return (
        <details class="board-speaker">
          <summary class="ui-btn ui-btn-next board-next">+ speaker</summary>
          <form method="post" action="/" class="mt-2">
            <input type="hidden" name="intent" value="speaker" />
            <input type="hidden" name="subject" value={subject.id} />
            <PeoplePicker
              initial={[]}
              autoSubmit
              placeholder="assign a speaker…"
              inputClass="ui-input"
            />
          </form>
        </details>
      );

    case "speaker":
      // With no session free, the subject page is where a date gets picked.
      if (!freeSession) {
        return (
          <a
            href={`/subjects/${subject.id}`}
            class="ui-btn ui-btn-next board-next"
          >
            plan →
          </a>
        );
      }
      return (
        <form method="post" action="/" class="board-act">
          <input type="hidden" name="intent" value="schedule" />
          <input type="hidden" name="subject" value={subject.id} />
          <input type="hidden" name="session" value={freeSession.id} />
          <button
            type="submit"
            class="ui-btn ui-btn-next board-next"
            title={`Plan on #${freeSession.id}, ${
              formatShortDate(freeSession.date)
            }`}
          >
            plan →
          </button>
        </form>
      );

    case "planned": {
      if (subject.sessionId === null || subject.sessionDate === null) {
        return null;
      }
      const days = daysUntil(subject.sessionDate);
      return (
        <a
          href={`/sessions/${subject.sessionId}`}
          class="ui-btn ui-btn-next board-next"
        >
          #{subject.sessionId} · {days === 0 ? "today" : `in ${days}d`}
        </a>
      );
    }

    case "presented":
      return subject.recordingUrl
        ? (
          <a
            href={subject.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="ui-btn ui-btn-next board-next"
          >
            recording ✓
          </a>
        )
        : (
          <a
            href={`/subjects/${subject.id}`}
            class="ui-btn ui-btn-next board-next"
          >
            add recording
          </a>
        );
  }
}
