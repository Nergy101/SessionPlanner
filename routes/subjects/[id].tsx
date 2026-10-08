import { HttpError, page } from "fresh";
import { define } from "@/utils.ts";
import {
  deleteSubject,
  getSubject,
  replaceSubjectLinks,
  setSubjectPeople,
  setSubjectSession,
  STAGE_LABEL,
  STAGE_MEANING,
  STAGE_ORDER,
  updateSubjectDetails,
} from "@/services/subjects.ts";
import { formatShortDate, listSessions } from "@/services/sessions.ts";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import PeoplePicker from "@/islands/PeoplePicker.tsx";
import AutoSubmitSelect from "@/islands/AutoSubmitSelect.tsx";
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

export default define.page<typeof handler>(function SubjectDetail({ data }) {
  const { subject, sessions, saved } = data;
  const showRecap = subject.stage === "presented";
  const stageIndex = STAGE_ORDER.indexOf(subject.stage);

  return (
    <>
      <div class="mb-6">
        <p class="ui-eyebrow">
          <a href="/subjects" class="text-text no-underline hover:underline">
            subjects
          </a>{" "}
          / #{subject.id}
        </p>
        <div class="mt-1 flex flex-wrap items-start justify-between gap-4">
          <h1 class="text-3xl tracking-tight">{subject.title}</h1>
          <StatusBadge stage={subject.stage} />
        </div>
        <p class="mt-1 text-muted">{STAGE_MEANING[subject.stage]}</p>
      </div>

      {/* Stage stepper: ✓ for completed, a shadow on the current stage, dashed and muted for the future. */}
      <ol class="mb-6 flex flex-wrap gap-2" aria-label="Stage">
        {STAGE_ORDER.map((s, i) => {
          const current = i === stageIndex;
          const done = i < stageIndex;
          const cls = current
            ? `stage-${s} ui-badge ui-badge-${s} shadow-[var(--shadow-md)]`
            : done
            ? "ui-badge bg-surface-2 text-text border border-line"
            : "ui-badge border border-dashed border-line text-muted";
          return (
            <li
              key={s}
              class={cls}
              aria-current={current ? "step" : undefined}
            >
              {done ? "✓ " : ""}
              {STAGE_LABEL[s]}
            </li>
          );
        })}
      </ol>

      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,340px)]">
        {/* Enter in any single-line field here submits, because it's a real form. */}
        <form method="post" class="flex flex-col gap-4">
          <input type="hidden" name="intent" value="details" />

          <div class="ui-panel flex flex-col gap-4">
            <div>
              <label class="ui-label" for="title">Title</label>
              <input
                id="title"
                name="title"
                value={subject.title}
                class="ui-input"
              />
            </div>

            <div>
              <label class="ui-label" for="description">Description</label>
              <textarea
                id="description"
                name="description"
                rows={6}
                placeholder="What is it about, and why would the team care?"
                class="ui-textarea"
              >
                {subject.description ?? ""}
              </textarea>
            </div>

            <div>
              <span class="ui-label">Links</span>
              <LinkEditor
                initial={subject.links.map((l) => ({
                  url: l.url,
                  label: l.label ?? "",
                }))}
              />
            </div>
          </div>

          {showRecap && (
            <div class="ui-panel flex flex-col gap-4">
              <h3>after the session</h3>

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
                <label class="ui-label" for="recapNotes">Notes</label>
                <textarea
                  id="recapNotes"
                  name="recapNotes"
                  rows={4}
                  placeholder="What came up, follow-ups, who asked what."
                  class="ui-textarea"
                >
                  {subject.recapNotes ?? ""}
                </textarea>
              </div>
            </div>
          )}

          <div class="flex flex-wrap items-center gap-3">
            <button type="submit" class="ui-btn ui-btn-primary">save</button>
            {saved
              ? <span class="ui-badge ui-badge-presented">saved</span>
              : (
                <span class="ui-hint">
                  Enter in any single-line field also saves · Esc reverts
                </span>
              )}
          </div>
        </form>

        <aside class="flex flex-col gap-4">
          {/* Its own form: Enter in the picker adds a chip, it never saves here. */}
          <form method="post" class="ui-panel">
            <input type="hidden" name="intent" value="people" />
            <h3 class="mb-3">speakers</h3>
            <PeoplePicker
              initial={subject.people.map((p) => p.name)}
              autoSubmit
            />
            {subject.people.length === 0 && (
              <p class="ui-hint mt-2">
                Adding the first speaker moves this to{" "}
                <strong>has speaker</strong>.
              </p>
            )}
            <noscript>
              <button type="submit" class="ui-btn mt-2">save speakers</button>
            </noscript>
          </form>

          <form method="post" class="ui-panel">
            <input type="hidden" name="intent" value="session" />
            <h3 class="mb-3">session</h3>
            <AutoSubmitSelect
              name="session"
              value={subject.sessionId === null
                ? ""
                : String(subject.sessionId)}
              ariaLabel="Session"
              class="ui-select"
              options={[
                { value: "", label: "unscheduled" },
                ...sessions.map((s) => ({
                  value: String(s.id),
                  label: formatShortDate(s.date),
                })),
              ]}
            />
            {sessions.length === 0 && (
              <p class="ui-hint mt-2">
                No sessions yet —{" "}
                <a href="/sessions" class="underline">create one</a>.
              </p>
            )}
          </form>

          <form method="post" class="ui-panel">
            <input type="hidden" name="intent" value="delete" />
            <h3 class="mb-3">danger zone</h3>
            <ConfirmButton
              label="delete subject"
              confirmLabel="yes, delete it"
            />
            <p class="ui-hint mt-2">Deleting is permanent.</p>
          </form>
        </aside>
      </div>
    </>
  );
});
