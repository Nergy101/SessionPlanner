import { HttpError, page } from "fresh";
import { define } from "@/utils.ts";
import {
  deleteSession,
  formatLongDate,
  getSession,
  isPast,
  markAllPresented,
  updateSession,
} from "@/services/sessions.ts";
import {
  createSubject,
  listSchedulable,
  setSubjectSession,
  setSubjectStatus,
} from "@/services/subjects.ts";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";
import AutoSubmitSelect from "@/islands/AutoSubmitSelect.tsx";
import ConfirmButton from "@/islands/ConfirmButton.tsx";

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
    const intent = String(form.get("intent") ?? "");
    const here = `/sessions/${id}`;

    switch (intent) {
      case "details": {
        const date = String(form.get("date") ?? "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          await updateSession(id, date, String(form.get("notes") ?? ""));
        }
        return ctx.redirect(`${here}?saved`, 303);
      }

      case "assign": {
        const subjectId = Number(form.get("subject"));
        if (Number.isFinite(subjectId)) await setSubjectSession(subjectId, id);
        return ctx.redirect(here, 303);
      }

      case "create": {
        const title = String(form.get("title") ?? "").trim();
        if (title) await createSubject(title, id);
        return ctx.redirect(here, 303);
      }

      case "unassign": {
        const subjectId = Number(form.get("subject"));
        if (Number.isFinite(subjectId)) {
          await setSubjectSession(subjectId, null);
        }
        return ctx.redirect(here, 303);
      }

      case "present": {
        const subjectId = Number(form.get("subject"));
        if (Number.isFinite(subjectId)) {
          await setSubjectStatus(subjectId, "presented");
        }
        return ctx.redirect(here, 303);
      }

      case "presentAll":
        await markAllPresented(id);
        return ctx.redirect(here, 303);

      case "delete":
        await deleteSession(id);
        return ctx.redirect("/sessions", 303);
    }

    return ctx.redirect(here, 303);
  },
});

export default define.page<typeof handler>(function SessionDetail({ data }) {
  const { session, available, saved } = data;
  const anyPlanned = session.subjects.some((s) => s.status === "planned");

  return (
    <>
      <div class="mb-6">
        <p class="ui-eyebrow">
          <a href="/sessions" class="no-underline hover:text-brand">sessions</a>
          {" "}
          / #{session.id}
        </p>
        <div class="mt-1 flex items-start justify-between gap-4">
          <h1 class="text-2xl">{formatLongDate(session.date)}</h1>
          {isPast(session.date) && anyPlanned && (
            <form method="post">
              <input type="hidden" name="intent" value="presentAll" />
              <button type="submit" class="ui-btn ui-btn-primary">
                mark all presented
              </button>
            </form>
          )}
        </div>
        <p class="mt-1 text-slate-600 dark:text-slate-400">
          {session.subjects.length}{" "}
          subject{session.subjects.length === 1 ? "" : "s"} planned.
        </p>
      </div>

      <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(17rem,1fr)]">
        <div class="flex flex-col gap-2">
          {session.subjects.length === 0
            ? (
              <div class="ui-empty">
                Nothing planned yet. Add one from the panel on the right.
              </div>
            )
            : session.subjects.map((s) => (
              <div key={s.id} class="ui-card">
                <div class="flex items-start justify-between gap-2">
                  <a
                    href={`/subjects/${s.id}`}
                    class="font-mono text-sm font-semibold text-slate-900 no-underline hover:text-brand dark:text-slate-100"
                  >
                    {s.title}
                  </a>
                  <StatusBadge status={s.status} />
                </div>

                <div class="flex flex-wrap gap-1">
                  {s.people.length
                    ? s.people.map((p) => (
                      <span key={p.id} class="ui-chip ui-chip-person">
                        {p.name}
                      </span>
                    ))
                    : <span class="ui-badge ui-badge-danger">no speaker</span>}
                </div>

                <div class="mt-auto flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-2 dark:border-slate-700/70">
                  {s.status === "planned" && (
                    <form method="post">
                      <input type="hidden" name="intent" value="present" />
                      <input type="hidden" name="subject" value={s.id} />
                      <button type="submit" class="ui-btn ui-btn-sm">
                        mark presented
                      </button>
                    </form>
                  )}
                  <form method="post">
                    <input type="hidden" name="intent" value="unassign" />
                    <input type="hidden" name="subject" value={s.id} />
                    <button type="submit" class="ui-btn ui-btn-sm ui-btn-ghost">
                      remove from this date
                    </button>
                  </form>
                </div>
              </div>
            ))}
        </div>

        <aside class="flex flex-col gap-4">
          <div class="ui-panel flex flex-col gap-3">
            <h3>add a subject</h3>

            {available.length
              ? (
                <form method="post">
                  <input type="hidden" name="intent" value="assign" />
                  <AutoSubmitSelect
                    name="subject"
                    value=""
                    ariaLabel="Add an existing subject"
                    class="ui-select"
                    options={[
                      { value: "", label: "pick from the pool…" },
                      ...available.map((s) => ({
                        value: String(s.id),
                        label: s.people.length
                          ? s.title
                          : `${s.title} (needs a speaker)`,
                      })),
                    ]}
                  />
                </form>
              )
              : (
                <p class="text-[0.78rem] text-slate-600 dark:text-slate-400">
                  Nothing unscheduled left in the pool.
                </p>
              )}

            <QuickAdd
              action={`/sessions/${session.id}`}
              intent="create"
              placeholder="…or a brand new topic"
              label="add here"
            />
          </div>

          <form method="post" class="ui-panel flex flex-col gap-3">
            <input type="hidden" name="intent" value="details" />
            <h3>details</h3>

            <div>
              <label class="ui-label" for="date">Date</label>
              <input
                id="date"
                name="date"
                type="date"
                required
                value={session.date}
                class="ui-input"
              />
            </div>

            <div>
              <label class="ui-label" for="notes">Notes</label>
              <textarea
                id="notes"
                name="notes"
                rows={5}
                placeholder="room, theme, agenda, catering…"
                class="ui-textarea"
              >
                {session.notes ?? ""}
              </textarea>
            </div>

            <div class="flex items-center gap-3">
              <button type="submit" class="ui-btn ui-btn-primary">save</button>
              {saved && <span class="ui-badge ui-badge-presented">saved</span>}
            </div>
          </form>

          <form method="post" class="ui-panel">
            <input type="hidden" name="intent" value="delete" />
            <h3 class="mb-3">danger zone</h3>
            <ConfirmButton
              label="delete session"
              confirmLabel="yes, delete it"
            />
            <p class="mt-2 text-[0.78rem] text-slate-600 dark:text-slate-400">
              Its subjects survive — they drop back to assigned or idea.
            </p>
          </form>
        </aside>
      </div>
    </>
  );
});
