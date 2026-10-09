import { HttpError, page } from "fresh";
import { define } from "@/utils.ts";
import {
  daysAway,
  deleteSession,
  formatLongDate,
  getSession,
  isPast,
  parseTime,
  rescheduleSession,
  type Session,
  SESSION_SLOTS,
  setSessionNotes,
} from "@/services/sessions.ts";
import {
  createSubject,
  linkLabel,
  listSchedulable,
  moveSubject,
  setSubjectRecording,
  setSubjectSession,
  STAGE_LABEL,
  type Subject,
} from "@/services/subjects.ts";
import { agendaText } from "@/services/calendar.ts";
import { Avatar } from "@/components/Avatar.tsx";
import AddSubject from "@/islands/AddSubject.tsx";
import ConfirmButton from "@/islands/ConfirmButton.tsx";
import CopyText from "@/islands/CopyText.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) throw new HttpError(404);

    const session = await getSession(id);
    if (!session) throw new HttpError(404);

    return page({
      session,
      available: await listSchedulable(),
      saved: ctx.url.searchParams.has("saved"),
    });
  },

  async POST(ctx) {
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id)) throw new HttpError(404);

    const form = await ctx.req.formData();
    const action = ACTIONS.get(String(form.get("intent") ?? ""));
    const next = action ? await action(id, form) : undefined;
    return ctx.redirect(next ?? `/sessions/${id}`, 303);
  },
});

/**
 * Each form intent on this page. One returning a path redirects there; the
 * rest come back to the session.
 */
const ACTIONS = new Map<
  string,
  (id: number, form: FormData) => Promise<string | void>
>([
  ["when", reschedule],
  ["notes", saveNotes],
  ["add", addSubject],
  ["move", move],
  ["unassign", unassign],
  ["recording", saveRecording],
  ["delete", removeSession],
]);

async function saveNotes(id: number, form: FormData): Promise<string> {
  await setSessionNotes(id, String(form.get("notes") ?? ""));
  return `/sessions/${id}?saved`;
}

function move(_id: number, form: FormData): Promise<void> {
  const step = form.get("dir") === "up" ? -1 : 1;
  return withSubject(form, (subjectId) => moveSubject(subjectId, step));
}

function unassign(_id: number, form: FormData): Promise<void> {
  return withSubject(form, (subjectId) => setSubjectSession(subjectId, null));
}

function saveRecording(_id: number, form: FormData): Promise<void> {
  const url = String(form.get("url") ?? "");
  return withSubject(form, (subjectId) => setSubjectRecording(subjectId, url));
}

async function removeSession(id: number): Promise<string> {
  await deleteSession(id);
  return "/sessions";
}

async function reschedule(id: number, form: FormData): Promise<void> {
  const date = String(form.get("date") ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await rescheduleSession(id, {
      date,
      startTime: parseTime(form.get("time")),
    });
  }
}

/**
 * Schedules the backlog subject with exactly the typed title, or creates a
 * new one on this session. Subjects already on a session are never moved
 * from here, so a typed title can't steal one from another date.
 */
async function addSubject(id: number, form: FormData): Promise<void> {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return;
  const lower = title.toLowerCase();
  const match = (await listSchedulable()).find((s) =>
    s.title.toLowerCase() === lower
  );
  if (match) await setSubjectSession(match.id, id);
  else await createSubject(title, id);
}

/** Runs `change` on the form's subject id, if it has a valid one. */
async function withSubject(
  form: FormData,
  change: (subjectId: number) => Promise<void>,
): Promise<void> {
  const subjectId = Number(form.get("subject"));
  if (Number.isFinite(subjectId)) await change(subjectId);
}

export default define.page<typeof handler>(function SessionDetail({ data }) {
  const { session, available, saved } = data;
  const past = isPast(session.date);

  return (
    <>
      <p class="ui-eyebrow mb-4">
        <a href="/sessions">Sessions</a> / #{session.id}
      </p>

      <SessionHero session={session} />

      <div class="detail-grid">
        <div class="flex flex-col gap-5">
          <section>
            <h2 class="ui-eyebrow mb-3">Agenda</h2>
            <ol class="flex flex-col gap-3">
              {session.subjects.length === 0 && (
                <li class="ui-empty">Nothing planned yet. Add one below.</li>
              )}
              {session.subjects.map((s, i) => (
                <AgendaItem
                  key={s.id}
                  subject={s}
                  position={i + 1}
                  last={i === session.subjects.length - 1}
                />
              ))}
            </ol>
          </section>
          <AddSubjectCard session={session} available={available} />
        </div>

        <aside class="flex flex-col gap-4">
          {past && session.subjects.length > 0 && (
            <RecordingsCard session={session} />
          )}
          <NotesForm session={session} saved={saved} />
          <ShareCard session={session} />
        </aside>
      </div>
    </>
  );
});

/** The #n sticker, the editable date, how far off it is and the slot squares. */
function SessionHero({ session }: { session: Session }) {
  const filled = session.subjects.length;
  return (
    <header class="session-hero">
      <span class="sticker sticker-big sticker-primary">#{session.id}</span>
      <div class="min-w-0 flex-1">
        <DateForm session={session} />
        <p class="mt-1 text-muted">
          {isPast(session.date) ? "took place" : daysAway(session.date)} ·{" "}
          {filled} of {SESSION_SLOTS} slots filled
        </p>
      </div>
      <span class="slot-row" aria-hidden="true">
        {Array.from({ length: SESSION_SLOTS }, (_, i) => (
          <span
            key={i}
            class={`slot ${i < filled ? "slot-filled" : "slot-open"}`}
          />
        ))}
      </span>
    </header>
  );
}

/** Find an unscheduled subject in the backlog, or create one straight onto this date. */
function AddSubjectCard({ session, available }: {
  session: Session;
  available: Subject[];
}) {
  return (
    <section class="ui-panel flex flex-col gap-3">
      <h2 class="text-lg">Add subject</h2>
      <AddSubject
        sessionId={session.id}
        backlog={available.map((s) => ({
          title: s.title,
          stage: s.stage,
          stageLabel: STAGE_LABEL[s.stage],
        }))}
      />
      <p class="ui-hint">
        {available.length
          ? `${available.length} unscheduled in the backlog, speaker-ready first.`
          : "Nothing unscheduled left in the backlog; type a title to create one."}
      </p>
    </section>
  );
}

/** Copy the agenda, download it for a calendar, or delete the session. */
function ShareCard({ session }: { session: Session }) {
  const text = agendaText(session);
  return (
    <section class="ui-card flex flex-col gap-3">
      <div class="flex flex-wrap gap-2">
        <CopyText text={text} label="Copy agenda as text" />
        <a
          href={`/sessions/${session.id}/ics`}
          class="ui-btn ui-btn-sm"
          download
        >
          Download .ics
        </a>
      </div>
      <details>
        <summary class="ui-hint cursor-pointer">Show agenda text</summary>
        {/* The text Copy puts on the clipboard; straat-taal leaves it as is. */}
        <pre class="agenda-text" data-no-straat>{text}</pre>
      </details>
      <form method="post" class="border-t-2 border-dashed border-line pt-3">
        <input type="hidden" name="intent" value="delete" />
        <ConfirmButton label="Delete session…" confirmLabel="Yes, delete it" />
        <p class="ui-hint mt-1">
          Its subjects survive and go back to the backlog.
        </p>
      </form>
    </section>
  );
}

function NotesForm({ session, saved }: { session: Session; saved: boolean }) {
  return (
    <form method="post" class="ui-panel flex flex-col gap-3">
      <input type="hidden" name="intent" value="notes" />
      <h2 class="text-lg">Notes</h2>
      <textarea
        id="notes"
        name="notes"
        rows={4}
        aria-label="Session notes"
        placeholder="Room, theme, catering…"
        class="ui-textarea"
      >
        {session.notes ?? ""}
      </textarea>
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class="ui-btn ui-btn-sm ui-btn-primary">
          Save
        </button>
        {saved && <span class="text-xs font-bold text-ok-text">✓ saved</span>}
      </div>
    </form>
  );
}

/** The date and time line: looks like a heading, edits like fields, saves on submit. */
function DateForm({ session }: { session: Session }) {
  return (
    <form method="post" class="flex flex-wrap items-center gap-2">
      <input type="hidden" name="intent" value="when" />
      <h1 class="sr-only">{formatLongDate(session.date)}</h1>
      <input
        name="date"
        type="date"
        required
        value={session.date}
        aria-label="Session date"
        class="date-inline"
      />
      <input
        name="time"
        type="time"
        value={session.startTime ?? ""}
        aria-label="Start time"
        class="date-inline"
      />
      <button type="submit" class="ui-btn ui-btn-sm">Change</button>
    </form>
  );
}

function AgendaItem({ subject, position, last }: {
  subject: Subject;
  position: number;
  last: boolean;
}) {
  return (
    <li class="ui-card agenda-item">
      <span class={`num-tile num-tile-${subject.stage}`}>{position}</span>
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <a href={`/subjects/${subject.id}`} class="agenda-title">
          {subject.title}
        </a>
        <div class="flex flex-wrap items-center gap-2">
          {subject.people.length
            ? (
              <>
                {subject.people.map((p) => (
                  <Avatar key={p.id} name={p.name} stage={subject.stage} />
                ))}
                <span class="text-sm">
                  {subject.people.map((p) => p.name).join(" & ")}
                </span>
              </>
            )
            : <span class="ui-badge ui-badge-danger">no speaker</span>}
        </div>
        {subject.links.length > 0 && (
          <div class="flex flex-wrap gap-1.5">
            {subject.links.slice(0, 3).map((l) => (
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
      <div class="agenda-actions">
        <MoveButton subject={subject} dir="up" disabled={position === 1} />
        <MoveButton subject={subject} dir="down" disabled={last} />
        <form method="post">
          <input type="hidden" name="intent" value="unassign" />
          <input type="hidden" name="subject" value={subject.id} />
          <button type="submit" class="ui-btn ui-btn-sm">Remove</button>
        </form>
      </div>
    </li>
  );
}

/** One step earlier or later in the running order. */
function MoveButton({ subject, dir, disabled }: {
  subject: Subject;
  dir: "up" | "down";
  disabled: boolean;
}) {
  const label = dir === "up" ? "Move earlier" : "Move later";
  return (
    <form method="post">
      <input type="hidden" name="intent" value="move" />
      <input type="hidden" name="subject" value={subject.id} />
      <input type="hidden" name="dir" value={dir} />
      <button
        type="submit"
        class="ui-btn ui-btn-sm"
        disabled={disabled}
        aria-label={`${label}: ${subject.title}`}
        title={label}
      >
        {dir === "up" ? "↑" : "↓"}
        <span class="agenda-move-word">{dir === "up" ? " Up" : " Down"}</span>
      </button>
    </form>
  );
}

/** After the date: paste each subject's recording link. */
function RecordingsCard({ session }: { session: Session }) {
  return (
    <section class="ui-panel flex flex-col gap-3">
      <h2 class="text-lg">After the session</h2>
      <p class="ui-hint">Paste a recording link per subject.</p>
      {session.subjects.map((s) => (
        <form key={s.id} method="post" class="flex flex-col gap-1.5">
          <input type="hidden" name="intent" value="recording" />
          <input type="hidden" name="subject" value={s.id} />
          <label class="ui-label truncate" for={`rec-${s.id}`}>
            {s.title}
          </label>
          <div class="flex gap-2">
            <input
              id={`rec-${s.id}`}
              name="url"
              type="url"
              value={s.recordingUrl ?? ""}
              placeholder="https://…"
              class="ui-input"
            />
            <button type="submit" class="ui-btn ui-btn-sm">
              {s.recordingUrl ? "✓" : "Save"}
            </button>
          </div>
        </form>
      ))}
    </section>
  );
}
