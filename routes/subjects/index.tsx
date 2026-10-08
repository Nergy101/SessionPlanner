import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  createSubject,
  isSortKey,
  linkLabel,
  listSubjects,
  setSubjectPeople,
  setSubjectSession,
  setSubjectTitle,
  type SortDir,
  type SortKey,
  sortSubjects,
  type Stage,
  STAGE_LABEL,
  STAGE_ORDER,
} from "@/services/subjects.ts";
import { formatShortDate, listSessions } from "@/services/sessions.ts";
import { listPeople } from "@/services/people.ts";
import { SpeakerSelect } from "@/components/SpeakerSelect.tsx";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";
import InlineText from "@/islands/InlineText.tsx";
import AutoSubmitSelect from "@/islands/AutoSubmitSelect.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams;
    const text = q.get("q") ?? "";
    const stageParam = q.get("stage") ?? "";
    const personParam = q.get("person") ?? "";

    const stage = STAGE_ORDER.includes(stageParam as Stage)
      ? stageParam as Stage
      : undefined;
    const personId = personParam ? Number(personParam) : undefined;
    const sortParam = q.get("sort") ?? "";
    const sort = isSortKey(sortParam) ? sortParam : null;
    const dir: SortDir = q.get("dir") === "desc" ? "desc" : "asc";

    const [subjects, everything, sessions, people] = await Promise.all([
      listSubjects({
        text,
        stage,
        personId: Number.isFinite(personId) ? personId : undefined,
      }),
      // Unfiltered, so the stage pills show how many each one holds in total.
      listSubjects(),
      listSessions(),
      listPeople(),
    ]);

    const counts = {
      all: everything.length,
      idea: 0,
      speaker: 0,
      planned: 0,
      presented: 0,
    };
    for (const s of everything) counts[s.stage] += 1;

    return page({
      // No sort chosen keeps the list's own attention-first order.
      subjects: sort ? sortSubjects(subjects, sort, dir) : subjects,
      sort,
      dir,
      sessions,
      people,
      counts,
      text,
      stage: stageParam,
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
      case "session": {
        const value = String(form.get("session") ?? "");
        await setSubjectSession(id, value ? Number(value) : null);
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
  const {
    subjects,
    sort,
    dir,
    sessions,
    people,
    counts,
    text,
    stage,
    person,
    added,
  } = data;

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
    const first: SortDir = "asc";
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
          class={`inline-flex items-center gap-1 text-text no-underline hover:underline ${
            active ? "font-bold" : ""
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

  /** The stage pills are plain links, so each one is a bookmarkable filter. */
  const stagePills = [
    { key: "", label: "All", count: counts.all },
    ...STAGE_ORDER.map((s) => ({
      key: s,
      label: STAGE_LABEL[s],
      count: counts[s],
    })),
  ].map((pill) => {
    const params = new URLSearchParams(url.search);
    params.delete("added");
    if (pill.key) params.set("stage", pill.key);
    else params.delete("stage");
    return { ...pill, href: `/subjects?${params}`, active: stage === pill.key };
  });

  return (
    <>
      <div class="mb-6">
        <h1 class="text-3xl tracking-tight">subjects</h1>
        <p class="mt-1 max-w-2xl text-muted">
          {counts.all}{" "}
          total · the backlog and the archive. Title, session and speakers are
          editable right here.
        </p>
      </div>

      <div class="mb-4">
        <QuickAdd action={`/subjects${url.search}`} intent="create" autofocus />
        {added && (
          <p class="ui-hint mt-2">
            added <strong class="text-text">{added}</strong>{" "}
            — keep typing to add another.
          </p>
        )}
      </div>

      <nav class="mb-4 flex flex-wrap gap-2" aria-label="Filter by stage">
        {stagePills.map((pill) => (
          <a
            key={pill.key || "all"}
            href={pill.href}
            class={`ui-btn ui-btn-sm no-underline ${
              pill.active ? "ui-btn-primary" : "ui-btn-ghost"
            }`}
            aria-current={pill.active ? "page" : undefined}
          >
            {pill.label} <span class="opacity-70">{pill.count}</span>
          </a>
        ))}
      </nav>

      <div class="ui-table-wrap">
        {
          /* GET, so a filtered view is a plain bookmarkable query string. The
            person select applies on change and Enter applies the search, so there is
            no "filter" button to press. */
        }
        <form method="get" class="ui-toolbar">
          {sort && (
            <>
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />
            </>
          )}
          {stage && <input type="hidden" name="stage" value={stage} />}
          <input
            type="search"
            name="q"
            value={text}
            autofocus
            placeholder="Search title, description, speaker, link…"
            aria-label="Search subjects"
            class="ui-input min-w-[14rem] flex-1"
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
          {(text || stage || person || sort) && (
            <a href="/subjects" class="ui-btn ui-btn-ghost">clear</a>
          )}
        </form>

        {subjects.length === 0
          ? (
            <div class="p-4">
              <div class="ui-empty">
                {text || stage || person
                  ? "Nothing matches. Try clearing a filter."
                  : "No subjects yet. Capture the first one above."}
              </div>
            </div>
          )
          : (
            <div
              class="overflow-x-auto"
              role="region"
              tabindex={0}
              aria-label="Subjects table; scroll horizontally to see all columns"
            >
              <p class="ui-hint block px-3 py-2 lg:hidden">
                Swipe horizontally to see all columns →
              </p>
              <table class="w-full border-collapse">
                <thead>
                  <tr>
                    <th class="ui-th w-16"></th>
                    <SortHeader col="title" label="Title" class="w-[34%]" />
                    <SortHeader col="stage" label="Stage" />
                    <SortHeader col="speakers" label="Speakers" />
                    <th class="ui-th">Links</th>
                    <SortHeader col="session" label="Session" />
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s.id} class="hover:bg-surface-2">
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
                        <StatusBadge stage={s.stage} />
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
                        <div class="flex flex-wrap gap-1">
                          {s.links.slice(0, 2).map((l) => (
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
                          {s.links.length > 2 && (
                            <span class="ui-chip">+{s.links.length - 2}</span>
                          )}
                        </div>
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
        </p>
      )}
    </>
  );
});
