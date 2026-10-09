import { HttpError, page } from "fresh";
import { define } from "@/utils.ts";
import {
  deleteSubject,
  getSubject,
  idleSticker,
  replaceSubjectLinks,
  setSubjectPeople,
  setSubjectSession,
  type Stage,
  STAGE_LABEL,
  STAGE_ORDER,
  type Subject,
  updateSubjectDetails,
} from "@/services/subjects.ts";
import {
  formatShortDate,
  formatTimestamp,
  isPast,
  listSessions,
  type Session,
  SESSION_SLOTS,
} from "@/services/sessions.ts";
import PeoplePicker from "@/islands/PeoplePicker.tsx";
import LinkEditor from "@/islands/LinkEditor.tsx";
import ConfirmButton from "@/islands/ConfirmButton.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) throw new HttpError(404);

    const [subject, sessions] = await Promise.all([
      getSubject(id),
      listSessions(),
    ]);
    if (!subject) throw new HttpError(404);

    return page({
      subject,
      sessions,
      saved: ctx.url.searchParams.has("saved"),
    });
  },

  async POST(ctx) {
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) throw new HttpError(404);

    const form = await ctx.req.formData();
    const intent = String(form.get("intent") ?? "");
    const here = `/subjects/${id}`;

    switch (intent) {
      case "details": {
        await updateSubjectDetails(id, {
          title: String(form.get("title") ?? ""),
          description: String(form.get("description") ?? ""),
          slidesUrl: String(form.get("slidesUrl") ?? ""),
          recordingUrl: String(form.get("recordingUrl") ?? ""),
          recapNotes: String(form.get("recapNotes") ?? ""),
        });

        // Links come back as parallel url/label arrays from the editor.
        const urls = form.getAll("linkUrl").map(String);
        const labels = form.getAll("linkLabel").map(String);
        await replaceSubjectLinks(
          id,
          urls.map((url, i) => ({ url, label: labels[i] ?? null })),
        );

        return ctx.redirect(`${here}?saved`, 303);
      }

      case "people":
        await setSubjectPeople(id, form.getAll("people").map(String));
        return ctx.redirect(here, 303);

      case "session": {
        const value = String(form.get("session") ?? "");
        await setSubjectSession(id, value ? Number(value) : null);
        return ctx.redirect(here, 303);
      }

      case "delete":
        await deleteSubject(id);
        return ctx.redirect("/subjects", 303);
    }

    return ctx.redirect(here, 303);
  },
});

/** The cyan next-step card's heading, per stage. */
const NEXT_STEP: Record<Stage, string> = {
  idea: "Next step: find a speaker",
  speaker: "Next step: put it on a date",
  planned: "Next step: present it",
  presented: "Done: it was presented",
};

export default define.page<typeof handler>(function SubjectDetail({ data }) {
  const { subject, sessions, saved } = data;
  const idle = idleSticker(subject);

  return (
    <>
      <p class="ui-eyebrow mb-4">
        <a href="/subjects">Subjects</a> / #{subject.id}
      </p>

      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Stepper stage={subject.stage} />
        {idle !== null && <span class="sticker">idle {idle}d!</span>}
      </div>

      {subject.stage === "presented" && <Outcome subject={subject} />}

      <div class="detail-grid">
        <div class="flex flex-col gap-5">
          <DetailsForm subject={subject} saved={saved} />
          <SpeakersForm subject={subject} />
        </div>

        <aside class="flex flex-col gap-4">
          <NextStepCard subject={subject} sessions={sessions} />
          <HistoryCard subject={subject} />
        </aside>
      </div>
    </>
  );
});

/** A presented subject leads with its recording and slides. */
function Outcome({ subject }: { subject: Subject }) {
  if (!subject.recordingUrl && !subject.slidesUrl) return null;
  return (
    <div class="mb-4 flex flex-wrap gap-2">
      {subject.recordingUrl && (
        <a
          href={subject.recordingUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="ui-btn ui-btn-primary"
        >
          ▶ Recording
        </a>
      )}
      {subject.slidesUrl && (
        <a
          href={subject.slidesUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="ui-btn"
        >
          Slides ↗
        </a>
      )}
    </div>
  );
}

/** Title, description, links and recap. Enter in a single-line field saves, as it's a real form. */
function DetailsForm({ subject, saved }: { subject: Subject; saved: boolean }) {
  return (
    <form method="post" class="flex flex-col gap-4">
      <input type="hidden" name="intent" value="details" />

      <div>
        <h1 class="sr-only">{subject.title}</h1>
        <input
          id="title"
          name="title"
          value={subject.title}
          required
          aria-label="Title"
          class="ui-input title-input"
        />
        <p class="ui-hint mt-1">⏎ save</p>
      </div>

      <div>
        <label class="ui-label" for="description">Description</label>
        <textarea
          id="description"
          name="description"
          rows={5}
          placeholder="What is it about, and why would the team care?"
          class="ui-textarea description-input"
        >
          {subject.description ?? ""}
        </textarea>
      </div>

      <section class="ui-card flex flex-col gap-2">
        <h2 class="text-base">Links</h2>
        <LinkEditor
          initial={subject.links.map((l) => ({
            url: l.url,
            label: l.label ?? "",
          }))}
        />
      </section>

      {subject.stage === "presented" && <RecapFields subject={subject} />}

      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="ui-btn ui-btn-primary">Save</button>
        {saved && <span class="text-xs font-bold text-ok-text">✓ saved</span>}
      </div>
    </form>
  );
}

/** Its own form: Enter in the picker adds a speaker, it never saves the details. */
function SpeakersForm({ subject }: { subject: Subject }) {
  return (
    <form method="post" class="ui-panel">
      <input type="hidden" name="intent" value="people" />
      <h2 class="mb-3 text-base">Speakers</h2>
      <PeoplePicker initial={subject.people.map((p) => p.name)} autoSubmit />
      <p class="ui-hint mt-2">
        ↑↓ pick · ⏎ add · ⌫ on empty removes the last · esc close
      </p>
      <noscript>
        <button type="submit" class="ui-btn mt-2">Save speakers</button>
      </noscript>
    </form>
  );
}

/** Pills joined by arrows: ✓ for done, a shadow on the current stage, dashed for what's ahead. */
function Stepper({ stage }: { stage: Stage }) {
  const current = STAGE_ORDER.indexOf(stage);
  return (
    <ol class="stepper" aria-label="Stage">
      {STAGE_ORDER.map((s, i) => (
        <li key={s} class="contents">
          {i > 0 && <span class="step-arrow" aria-hidden="true">→</span>}
          <span
            class={`step ${
              i === current
                ? `step-current step-${s}`
                : i > current
                ? "step-future"
                : ""
            }`}
            aria-current={i === current ? "step" : undefined}
          >
            {i < current ? "✓ " : ""}
            {STAGE_LABEL[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function RecapFields({ subject }: { subject: Subject }) {
  return (
    <section class="ui-card flex flex-col gap-3">
      <h2 class="text-base">After the session</h2>
      <div>
        <label class="ui-label" for="recordingUrl">Recording</label>
        <input
          id="recordingUrl"
          name="recordingUrl"
          type="url"
          value={subject.recordingUrl ?? ""}
          placeholder="https://…"
          class="ui-input"
        />
      </div>
      <div>
        <label class="ui-label" for="slidesUrl">Slides</label>
        <input
          id="slidesUrl"
          name="slidesUrl"
          type="url"
          value={subject.slidesUrl ?? ""}
          placeholder="https://…"
          class="ui-input"
        />
      </div>
      <div>
        <label class="ui-label" for="recapNotes">Notes</label>
        <textarea
          id="recapNotes"
          name="recapNotes"
          rows={3}
          placeholder="What came up, follow-ups, who asked what."
          class="ui-textarea"
        >
          {subject.recapNotes ?? ""}
        </textarea>
      </div>
    </section>
  );
}

/**
 * The cyan card: what this subject needs next, and the session picker that
 * moves it on. Upcoming dates come first and show their open slots.
 */
function NextStepCard({ subject, sessions }: {
  subject: Subject;
  sessions: Session[];
}) {
  return (
    <form method="post" class="ui-panel next-card">
      <input type="hidden" name="intent" value="session" />
      <h2 class="text-base">{NEXT_STEP[subject.stage]}</h2>
      {subject.stage === "idea" && (
        <p class="mt-1 text-sm">
          Add a speaker on the left. You can already pick a date.
        </p>
      )}
      <label class="ui-label mt-3" for="session">Session</label>
      <SessionSelect sessions={sessions} current={subject.sessionId} />
      <button type="submit" class="ui-btn ui-btn-plan mt-3">
        {subject.sessionId === null ? "Plan it" : "Move it"}
      </button>
      {sessions.length === 0 && (
        <p class="mt-2 text-sm">
          No sessions yet. <a href="/sessions" class="underline">Add a date</a>.
        </p>
      )}
    </form>
  );
}

/** Upcoming dates first, soonest on top, each with its open slots; then the past. */
function SessionSelect({ sessions, current }: {
  sessions: Session[];
  current: number | null;
}) {
  const upcoming = sessions.filter((s) => !isPast(s.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const earlier = sessions.filter((s) => isPast(s.date));
  const option = (s: Session, room: string) => (
    <option key={s.id} value={s.id} selected={s.id === current}>
      #{s.id} · {formatShortDate(s.date)}
      {room}
    </option>
  );
  const openSlots = (s: Session) =>
    ` — ${Math.max(0, SESSION_SLOTS - s.subjects.length)} open`;

  return (
    <select id="session" name="session" class="ui-select">
      <option value="">Unscheduled</option>
      {upcoming.length > 0 && (
        <optgroup label="Upcoming">
          {upcoming.map((s) => option(s, openSlots(s)))}
        </optgroup>
      )}
      {earlier.length > 0 && (
        <optgroup label="Past">{earlier.map((s) => option(s, ""))}</optgroup>
      )}
    </select>
  );
}

function HistoryCard({ subject }: { subject: Subject }) {
  return (
    <section class="ui-card flex flex-col gap-2">
      <h2 class="text-base">History</h2>
      <dl class="history">
        <dt>Captured</dt>
        <dd>{formatTimestamp(subject.createdAt)}</dd>
        {subject.stageChangedAt && (
          <>
            <dt>Stage changed</dt>
            <dd>{formatTimestamp(subject.stageChangedAt)}</dd>
          </>
        )}
        <dt>Last edit</dt>
        <dd>{formatTimestamp(subject.updatedAt)}</dd>
      </dl>
      <form method="post" class="card-foot">
        <input type="hidden" name="intent" value="delete" />
        <ConfirmButton
          label="Delete subject…"
          confirmLabel="Yes, delete it"
        />
      </form>
    </section>
  );
}
