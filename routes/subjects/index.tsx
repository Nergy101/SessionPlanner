import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  createSubject,
  isSortKey,
  linkLabel,
  listSubjects,
  type SortDir,
  type SortKey,
  sortSubjects,
  type Stage,
  STAGE_ORDER,
} from "@/services/subjects.ts";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";
import ListKeys from "@/islands/ListKeys.tsx";

/** Filter pill labels. The stage badges keep the bare stage names. */
const PILL_LABEL: Record<Stage, string> = {
  idea: "Idea",
  speaker: "Has speaker",
  planned: "Planned",
  presented: "Presented",
};

export const handler = define.handlers({
  async GET(ctx) {
    const q = ctx.url.searchParams;
    const text = q.get("q") ?? "";
    const stageParam = q.get("stage") ?? "";
    const stage = STAGE_ORDER.includes(stageParam as Stage)
      ? stageParam as Stage
      : undefined;
    const sortParam = q.get("sort") ?? "";
    const sort = isSortKey(sortParam) ? sortParam : null;
    const dir: SortDir = q.get("dir") === "desc" ? "desc" : "asc";

    const [subjects, everything] = await Promise.all([
      listSubjects({ text, stage }),
      // Unfiltered, so the stage pills show how many each one holds in total.
      listSubjects(),
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
      counts,
      text,
      stage: stage ?? "",
      added: q.get("added"),
    });
  },

  /**
   * The list's only write is creating a subject; editing happens on the
   * subject's own page. The redirect keeps the filters and drops any stale
   * "added" notice.
   */
  async POST(ctx) {
    const form = await ctx.req.formData();
    const title = String(form.get("title") ?? "").trim();

    const filters = new URLSearchParams(ctx.url.search);
    filters.delete("added");
    if (!title) {
      const query = filters.toString();
      return ctx.redirect(query ? `/subjects?${query}` : "/subjects", 303);
    }

    await createSubject(title);
    // Straight back to the list, filters intact, so you can add several in a row.
    filters.set("added", title);
    return ctx.redirect(`/subjects?${filters}`, 303);
  },
});

export default define.page<typeof handler>(function Subjects({ data, url }) {
  const { subjects, sort, dir, counts, text, stage, added } = data;

  /** Sorting stays in the query string, so a sorted view is bookmarkable. */
  const sortLink = (col: SortKey, label: string) => {
    const active = sort === col;
    const next: SortDir = active && dir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams(url.search);
    params.delete("added");
    params.set("sort", col);
    params.set("dir", next);
    return (
      <a
        href={`/subjects?${params}`}
        class={`no-underline hover:underline ${active ? "text-text" : ""}`}
      >
        {label}{" "}
        <span aria-hidden="true" class={active ? "" : "opacity-30"}>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </a>
    );
  };

  const pills = [
    { key: "", label: "All", count: counts.all },
    ...STAGE_ORDER.map((s) => ({
      key: s,
      label: PILL_LABEL[s],
      count: counts[s],
    })),
  ];

  return (
    <>
      <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Subjects</h1>
          <p class="mt-1 text-muted">
            {counts.all} total · the backlog and the archive.
          </p>
        </div>

        <details class="ui-disclosure" open={Boolean(added)}>
          <summary class="ui-btn ui-btn-primary">+ New subject</summary>
          <div class="ui-popover ui-disclosure-panel p-3">
            <QuickAdd
              action={`/subjects${url.search}`}
              autofocus={Boolean(added)}
              placeholder="Title of the new subject…"
              label="Create"
            />
            {added && (
              <p class="ui-hint mt-2">
                Added <strong class="text-text">{added}</strong>{" "}
                — keep typing to add another.
              </p>
            )}
          </div>
        </details>
      </header>

      {/* GET, so a filtered view is a plain bookmarkable query string. */}
      <form
        method="get"
        role="search"
        class="mb-4 flex flex-wrap items-center gap-2"
      >
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
          autofocus={!added}
          placeholder="Search title, description, speaker, link…"
          aria-label="Search subjects"
          data-search="subjects"
          class="ui-input min-w-0 flex-1"
        />
        {(text || stage || sort) && (
          <a href="/subjects" class="ui-btn ui-btn-ghost">clear</a>
        )}
      </form>

      <nav class="mb-4 flex flex-wrap gap-2" aria-label="Filter by stage">
        {pills.map((pill) => {
          const params = new URLSearchParams(url.search);
          params.delete("added");
          if (pill.key) params.set("stage", pill.key);
          else params.delete("stage");
          const active = stage === pill.key;
          return (
            <a
              key={pill.key || "all"}
              href={`/subjects?${params}`}
              class={`ui-filter no-underline ${
                active ? "ui-filter-active" : ""
              }`}
              aria-current={active ? "page" : undefined}
            >
              {pill.label}
              <span class="ml-1.5 opacity-70">{pill.count}</span>
            </a>
          );
        })}
      </nav>

      <div class="ui-card overflow-hidden p-0">
        <div class="ui-row-head ui-row-subjects">
          {sortLink("title", "title")}
          {sortLink("stage", "stage")}
          {sortLink("speakers", "speakers")}
          <span>links</span>
          {sortLink("session", "session")}
        </div>

        {subjects.length === 0
          ? (
            <p class="ui-empty m-4">
              {text || stage
                ? "Nothing matches. Clear the search or the stage filter."
                : "No subjects yet. Add the first one with + New subject."}
            </p>
          )
          : subjects.map((s) => (
            <a
              key={s.id}
              href={`/subjects/${s.id}`}
              class="ui-row ui-row-subjects"
              data-row="subjects"
            >
              <span class="ui-row-title">{s.title}</span>
              <span>
                <StatusBadge stage={s.stage} />
              </span>
              <span class="min-w-0">
                {s.people.length > 0
                  ? s.people.map((p) => p.name).join(", ")
                  : <span class="text-muted">—</span>}
              </span>
              <span class="flex min-w-0 flex-wrap gap-1">
                {s.links.slice(0, 3).map((l) => (
                  <span key={l.id} class="ui-chip">{linkLabel(l)}</span>
                ))}
                {s.links.length > 3 && (
                  <span class="ui-chip-more">+{s.links.length - 3} more</span>
                )}
              </span>
              <span class="font-mono text-sm">
                {s.sessionId === null
                  ? <span class="text-muted">—</span>
                  : `#${s.sessionId}`}
              </span>
            </a>
          ))}
      </div>

      <p class="ui-hint mt-3">↑↓ move · ⏎ open · / focus search · esc clear</p>
      <ListKeys />
    </>
  );
});
