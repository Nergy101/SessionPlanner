import { HttpError, page } from "fresh";
import { define } from "@/utils.ts";
import {
  STATUS_MEANING,
  SUBJECT_STATUSES,
  type SubjectStatus,
  TECH_AREAS,
} from "@/db/schema.ts";
import {
  deleteSubject,
  getSubject,
  linkLabel,
  replaceSubjectLinks,
  setSubjectBounty,
  setSubjectPeople,
  setSubjectSession,
  setSubjectStatus,
  setSubjectTags,
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

      case "tags":
        await setSubjectTags(id, form.getAll("tags").map(String));
        return ctx.redirect(here, 303);

      case "bounty":
        await setSubjectBounty(id, Number(form.get("bounty")));
        return ctx.redirect(here, 303);

      case "session": {
        const value = String(form.get("session") ?? "");
        await setSubjectSession(id, value ? Number(value) : null);
        return ctx.redirect(here, 303);
      }

      case "status": {
        const value = String(form.get("status") ?? "");
        if (SUBJECT_STATUSES.includes(value as SubjectStatus)) {
          await setSubjectStatus(id, value as SubjectStatus);
        }
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
  const showRecap = subject.status === "presented" ||
    subject.status === "archived";

  return (
    <>
      <div class="mb-6">
        <p class="ui-eyebrow">
          <a href="/subjects" class="no-underline hover:text-brand">subjects</a>
          {" "}
          / #{subject.id}
        </p>
        <div class="mt-1 flex items-start justify-between gap-4">
          <h1 class="text-2xl">{subject.title}</h1>
          <StatusBadge status={subject.status} />
        </div>
        <p class="mt-1 text-slate-600 dark:text-slate-400">
          {STATUS_MEANING[subject.status]}
        </p>
      </div>

      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
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
                autofocus
                placeholder="What is it about, and why would the team care?"
                class="ui-textarea"
              >
                {subject.description ?? ""}
              </textarea>
            </div>

            <div>
              <label class="ui-label">Links</label>
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

          <div class="flex items-center gap-3">
            <button type="submit" class="ui-btn ui-btn-primary">save</button>
            {saved
              ? <span class="ui-badge ui-badge-presented">saved</span>
              : (
                <span class="ui-hint">
                  enter from any single-line field also saves
                </span>
              )}
          </div>

          {subject.links.length > 0 && (
            <div class="flex flex-wrap gap-1.5">
              {subject.links.map((l) => (
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
              <p class="mt-2 text-[0.78rem] text-slate-600 dark:text-slate-400">
                Adding the first speaker moves this to{" "}
                <strong>assigned</strong>.
              </p>
            )}
            <noscript>
              <button type="submit" class="ui-btn mt-2">save speakers</button>
            </noscript>
          </form>

          <form method="post" class="ui-panel">
            <input type="hidden" name="intent" value="tags" />
            <h3 class="mb-3">areas</h3>
            <p class="mb-2 text-[0.78rem] text-slate-600 dark:text-slate-400">
              Drives the coverage radar on{" "}
              <a href="/standings">standings</a>. Tick what this actually
              covers.
            </p>
            <div class="mb-3 grid grid-cols-2 gap-x-2">
              {TECH_AREAS.map((area) => (
                <label
                  key={area}
                  class="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-[0.75rem] hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    name="tags"
                    value={area}
                    checked={subject.tags.includes(area)}
                    class="accent-brand"
                  />
                  {area}
                </label>
              ))}
            </div>
            <button type="submit" class="ui-btn ui-btn-sm">save areas</button>
          </form>

          <form method="post" class="ui-panel">
            <input type="hidden" name="intent" value="bounty" />
            <h3 class="mb-3">bounty</h3>
            <p class="mb-2 text-[0.78rem] text-slate-600 dark:text-slate-400">
              Extra XP for whoever claims this and actually presents it. Only
              paid out on delivery.
            </p>
            <div class="flex items-center gap-2">
              <input
                type="number"
                name="bounty"
                min="0"
                step="5"
                value={subject.bounty}
                aria-label="Bounty in XP"
                class="ui-input w-24"
              />
              <span class="ui-hint">XP</span>
              <button type="submit" class="ui-btn ui-btn-sm ml-auto">
                set
              </button>
            </div>
            {subject.bounty > 0 && subject.people.length > 0 && (
              <p class="ui-hint mt-2">
                Claimed — pays out when it moves to presented.
              </p>
            )}
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
              <p class="mt-2 text-[0.78rem] text-slate-600 dark:text-slate-400">
                No sessions yet — <a href="/sessions">create one</a>.
              </p>
            )}
          </form>

          <form method="post" class="ui-panel">
            <input type="hidden" name="intent" value="status" />
            <h3 class="mb-3">status</h3>
            <AutoSubmitSelect
              name="status"
              value={subject.status}
              ariaLabel="Status"
              class="ui-select"
              options={SUBJECT_STATUSES.map((s) => ({ value: s, label: s }))}
            />
            <p class="mt-2 text-[0.78rem] text-slate-600 dark:text-slate-400">
              Idea, assigned and planned follow the speakers and the date on
              their own. Presented and archived stay put until you change them.
            </p>
          </form>

          <form method="post" class="ui-panel">
            <input type="hidden" name="intent" value="delete" />
            <h3 class="mb-3">danger zone</h3>
            <ConfirmButton
              label="delete subject"
              confirmLabel="yes, delete it"
            />
            <p class="mt-2 text-[0.78rem] text-slate-600 dark:text-slate-400">
              Archiving keeps the record; deleting does not.
            </p>
          </form>
        </aside>
      </div>
    </>
  );
});
