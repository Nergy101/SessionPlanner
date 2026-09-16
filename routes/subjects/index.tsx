import { page } from "fresh";
import { define } from "@/utils.ts";
import { SUBJECT_STATUSES, type SubjectStatus } from "@/db/schema.ts";
import {
  createSubject,
  isSortKey,
  listSubjects,
  setSubjectBounty,
  setSubjectPeople,
  setSubjectSession,
  setSubjectStatus,
  setSubjectTitle,
  type SortDir,
  type SortKey,
  sortSubjects,
} from "@/services/subjects.ts";
import { formatShortDate, listSessions } from "@/services/sessions.ts";
import { listPeople } from "@/services/people.ts";
import { SpeakerSelect } from "@/components/SpeakerSelect.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";
import InlineText from "@/islands/InlineText.tsx";
import AutoSubmitSelect from "@/islands/AutoSubmitSelect.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams;
    const text = q.get("q") ?? "";
    const statusParam = q.get("status") ?? "";
    const personParam = q.get("person") ?? "";

    const status = SUBJECT_STATUSES.includes(statusParam as SubjectStatus)
      ? statusParam as SubjectStatus
      : undefined;
    const personId = personParam ? Number(personParam) : undefined;
    const sortParam = q.get("sort") ?? "";
    const sort = isSortKey(sortParam) ? sortParam : null;
    const dir: SortDir = q.get("dir") === "desc" ? "desc" : "asc";

    const [subjects, sessions, people] = await Promise.all([
      listSubjects({
        text,
        status,
        personId: Number.isFinite(personId) ? personId : undefined,
        includeArchived: status === "archived",
      }),
      listSessions(),
      listPeople(),
    ]);

    return page({
      // No sort chosen keeps the list's own attention-first order.
      subjects: sort ? sortSubjects(subjects, sort, dir) : subjects,
      sort,
      dir,
      sessions,
      people,
      text,
      status: statusParam,
      person: personParam,
      added: q.get("added"),
    });
  },

  /**
   * Every mutation on this page posts here and redirects back to the same query
   * string, so filters and scroll position survive an edit.
   */
  async POST(ctx) {
    const form = await ctx.req.formData();
    const intent = String(form.get("intent") ?? "");

    // Keep the filters but drop any stale "added" notice, so editing a row later
    // doesn't re-announce a subject you added minutes ago.
    const filters = new URLSearchParams(ctx.url.search);
    filters.delete("added");
    const query = filters.toString();
    const back = query ? `/subjects?${query}` : "/subjects";

    if (intent === "create") {
      const title = String(form.get("title") ?? "").trim();
      if (!title) return ctx.redirect(back, 303);

      await createSubject(title);

      // Straight back to the list, filters intact, so you can add several in a row.
      filters.set("added", title);
      return ctx.redirect(`/subjects?${filters}`, 303);
    }

    const id = Number(form.get("id"));
    if (!Number.isFinite(id)) return ctx.redirect(back, 303);

    switch (intent) {
      case "title":
        await setSubjectTitle(id, String(form.get("title") ?? ""));
        break;
      case "status": {
        const value = String(form.get("status") ?? "");
        if (SUBJECT_STATUSES.includes(value as SubjectStatus)) {
          await setSubjectStatus(id, value as SubjectStatus);
        }
        break;
      }
      case "session": {
        const value = String(form.get("session") ?? "");
        await setSubjectSession(id, value ? Number(value) : null);
        break;
      }
      case "bounty": {
        const raw = String(form.get("bounty") ?? "").trim();
        if (raw) await setSubjectBounty(id, Number(raw));
        break;
      }
      case "people":
        // Unticking everything is a valid edit: it clears the speakers and drops the
        // subject back to idea.
        await setSubjectPeople(id, form.getAll("people").map(String));
        break;
    }

    return ctx.redirect(back, 303);
  },
});

export default define.page<typeof handler>(function Subjects({ data, url }) {
  const { subjects, sort, dir, sessions, people, text, status, person, added } =
    data;

  /** A header that sorts by its column; a second click flips the direction. */
  const SortHeader = (
    { col, label, title, class: cls }: {
      col: SortKey;
      label: string;
      title?: string;
      class?: string;
    },
  ) => {
    const active = sort === col;
    // Bounty is most useful biggest-first; everything else starts A→Z / soonest.
    const first: SortDir = col === "bounty" ? "desc" : "asc";
    const next: SortDir = active ? (dir === "asc" ? "desc" : "asc") : first;
    const params = new URLSearchParams(url.search);
    params.delete("added");
    params.set("sort", col);
    params.set("dir", next);

    return (
      <th
        class={`ui-th ${cls ?? ""}`}
        title={title}
        aria-sort={active
          ? (dir === "asc" ? "ascending" : "descending")
          : undefined}
      >
        <a
          href={`/subjects?${params}`}
          class={`inline-flex items-center gap-1 no-underline hover:text-brand ${
            active ? "text-brand" : "text-inherit"
          }`}
        >
          {label}
          <span aria-hidden="true" class={active ? "" : "opacity-30"}>
            {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </a>
      </th>
    );
  };

  const sessionOptions = [
    { value: "", label: "unscheduled" },
    ...sessions.map((s) => ({
      value: String(s.id),
      label: formatShortDate(s.date),
    })),
  ];
  const statusOptions = SUBJECT_STATUSES.map((s) => ({ value: s, label: s }));

  return (
    <>
      <div class="mb-6">
        <h1 class="text-2xl">subjects</h1>
        <p class="mt-1 max-w-2xl text-slate-600 dark:text-slate-400">
          Every topic, wherever it sits on the ladder. Title, status, date and
          bounty are editable right here.
        </p>
      </div>

      <div class="mb-6">
        <QuickAdd action={`/subjects${url.search}`} intent="create" autofocus />
        {added && (
          <p class="ui-hint mt-2">
            added{" "}
            <strong class="text-slate-900 dark:text-slate-100">{added}</strong>
            {" "}
            — keep typing to add another.
          </p>
        )}
      </div>

      <div class="ui-table-wrap">
        {
          /* GET, so a filtered view is a plain bookmarkable query string. The
            selects apply on change and Enter applies the search, so there is no
            "filter" button to press — nothing waits for a second action. */
        }
        <form method="get" class="ui-toolbar">
          {sort && (
            <>
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />
            </>
          )}
          <input
            type="search"
            name="q"
            value={text}
            autofocus
            placeholder="search titles and descriptions, then press enter"
            aria-label="Search subjects"
            class="ui-input min-w-[14rem] flex-1"
          />
          <AutoSubmitSelect
            name="status"
            value={status}
            ariaLabel="Filter by status"
            options={[
              { value: "", label: "all statuses" },
              ...SUBJECT_STATUSES.map((v) => ({ value: v, label: v })),
            ]}
          />
          <AutoSubmitSelect
            name="person"
            value={person}
            ariaLabel="Filter by person"
            options={[
              { value: "", label: "anyone" },
              ...people.map((p) => ({ value: String(p.id), label: p.name })),
            ]}
          />
          {(text || status || person || sort) && (
            <a href="/subjects" class="ui-btn ui-btn-ghost">clear</a>
          )}
        </form>

        {subjects.length === 0
          ? (
            <div class="p-4">
              <div class="ui-empty">
                {text || status || person
                  ? "Nothing matches. Try clearing a filter."
                  : "No subjects yet. Capture the first one above."}
              </div>
            </div>
          )
          : (
            <div class="overflow-x-auto">
              <table class="w-full border-collapse">
                <thead>
                  <tr>
                    <th class="ui-th w-16"></th>
                    <SortHeader col="title" label="Title" class="w-[34%]" />
                    <SortHeader col="speakers" label="Speakers" />
                    <SortHeader col="status" label="Status" />
                    <SortHeader col="session" label="Session" />
                    <SortHeader
                      col="bounty"
                      label="Bounty"
                      title="Extra XP for whoever presents it"
                    />
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr
                      key={s.id}
                      class="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td class="ui-td">
                        <a
                          href={`/subjects/${s.id}`}
                          title="Open the full detail page"
                          class="ui-btn ui-btn-sm ui-btn-ghost"
                        >
                          edit
                        </a>
                      </td>

                      <td class="ui-td min-w-[18rem]">
                        <form method="post" action={`/subjects${url.search}`}>
                          <input type="hidden" name="intent" value="title" />
                          <input type="hidden" name="id" value={s.id} />
                          <InlineText
                            name="title"
                            value={s.title}
                            ariaLabel="Title"
                          />
                        </form>
                      </td>

                      <td class="ui-td">
                        <SpeakerSelect
                          subjectId={s.id}
                          subjectTitle={s.title}
                          selected={s.people}
                          everyone={people}
                          action={`/subjects${url.search}`}
                        />
                      </td>

                      <td class="ui-td">
                        <form method="post" action={`/subjects${url.search}`}>
                          <input type="hidden" name="intent" value="status" />
                          <input type="hidden" name="id" value={s.id} />
                          <AutoSubmitSelect
                            name="status"
                            value={s.status}
                            options={statusOptions}
                            ariaLabel="Status"
                          />
                        </form>
                      </td>

                      <td class="ui-td">
                        <form method="post" action={`/subjects${url.search}`}>
                          <input type="hidden" name="intent" value="session" />
                          <input type="hidden" name="id" value={s.id} />
                          <AutoSubmitSelect
                            name="session"
                            value={s.sessionId === null
                              ? ""
                              : String(s.sessionId)}
                            options={sessionOptions}
                            ariaLabel="Session"
                          />
                        </form>
                      </td>

                      <td class="ui-td">
                        <form
                          method="post"
                          action={`/subjects${url.search}`}
                          class="flex items-center gap-1"
                        >
                          <input type="hidden" name="intent" value="bounty" />
                          <input type="hidden" name="id" value={s.id} />
                          <InlineText
                            name="bounty"
                            type="number"
                            min={0}
                            step={5}
                            value={String(s.bounty)}
                            ariaLabel={`Bounty for ${s.title}, in XP`}
                            class="w-20 text-right"
                            autosave={600}
                          />
                          <span class="ui-hint">XP</span>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {subjects.length > 0 && (
        <p class="ui-hint mt-3">
          {subjects.length} subject{subjects.length === 1 ? "" : "s"}
          {!status && " · archived hidden unless you filter for it"}
        </p>
      )}
    </>
  );
});
