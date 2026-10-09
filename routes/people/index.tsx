import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  addPerson,
  deletePerson,
  listPeople,
  mergePeople,
  normalizeName,
  renamePerson,
} from "@/services/people.ts";
import { listSubjects, type Subject } from "@/services/subjects.ts";
import type { Person } from "@/db/schema.ts";
import { Avatar } from "@/components/Avatar.tsx";
import InlineText from "@/islands/InlineText.tsx";
import AutoSubmitSelect from "@/islands/AutoSubmitSelect.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";

/** One way a name has been written, and how many subjects use it. */
interface Spelling {
  id: number;
  name: string;
  subjects: number;
}

/**
 * Everyone with their subjects, narrowed by a name filter, plus any names that
 * differ only in case or spacing. Subjects are loaded once, not per person.
 */
async function loadPeople(filter: string) {
  const [people, subjects] = await Promise.all([
    listPeople(),
    listSubjects(),
  ]);

  const rows = people.map((person) => personRow(person, subjects));
  const needle = filter.toLowerCase();
  return {
    rows: needle
      ? rows.filter((row) => row.name.toLowerCase().includes(needle))
      : rows,
    everyone: rows.map((row) => ({ id: row.id, name: row.name })),
    filter,
    duplicates: duplicateSpellings(rows),
  };
}

/** One person and the subjects they're on, idea first. */
function personRow(person: Person, subjects: Subject[]) {
  const theirs = subjects.filter((s) =>
    s.people.some((p) => p.id === person.id)
  );
  return {
    id: person.id,
    name: person.name,
    presented: theirs.filter((s) => s.stage === "presented").length,
    subjects: theirs
      .slice()
      .sort((a, b) => a.stage.localeCompare(b.stage))
      .map((s) => ({ id: s.id, title: s.title, stage: s.stage })),
  };
}

/**
 * Groups of names that match once case and spacing are ignored. Anything looser
 * is left to a human, so a merge is never suggested by guesswork.
 */
function duplicateSpellings(
  rows: { id: number; name: string; subjects: unknown[] }[],
): Spelling[][] {
  const byKey = new Map<string, Spelling[]>();
  for (const row of rows) {
    const key = normalizeName(row.name).toLowerCase();
    byKey.set(key, [...(byKey.get(key) ?? []), {
      id: row.id,
      name: row.name,
      subjects: row.subjects.length,
    }]);
  }
  return [...byKey.values()].filter((group) => group.length > 1);
}

export const handler = define.handlers({
  async GET(ctx) {
    const filter = (ctx.url.searchParams.get("q") ?? "").trim();
    return page({
      ...await loadPeople(filter),
      added: ctx.url.searchParams.get("added"),
      already: ctx.url.searchParams.has("already"),
    });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const action = ACTIONS.get(String(form.get("intent") ?? ""));
    return ctx.redirect(action ? await action(form) : "/people", 303);
  },
});

/** Each form intent on this page; each returns where to go next. */
const ACTIONS = new Map<string, (form: FormData) => Promise<string>>([
  ["create", addFromForm],
  ["merge-group", mergeGroup],
  [
    "rename",
    (form) =>
      withPerson(
        form,
        (id) => renamePerson(id, String(form.get("name") ?? "")),
      ),
  ],
  ["merge", (form) =>
    withPerson(form, async (id) => {
      const target = Number(form.get("target"));
      if (Number.isFinite(target)) await mergePeople(id, target);
    })],
  ["delete", (form) => withPerson(form, deletePerson)],
]);

/**
 * Quick-fire adding, same shape as the subject capture box: straight back to the
 * list with the cursor in the box, so you can type in a whole team in one go.
 */
async function addFromForm(form: FormData): Promise<string> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return "/people";

  const { person, created } = await addPerson(name);
  const params = new URLSearchParams({ added: person.name });
  if (!created) params.set("already", "1");
  return `/people?${params}`;
}

/** One duplicate group: every other spelling folds into the chosen one. */
async function mergeGroup(form: FormData): Promise<string> {
  const target = Number(form.get("target"));
  if (!Number.isFinite(target)) return "/people";

  const others = form.getAll("member").map(Number)
    .filter((id) => Number.isFinite(id) && id !== target);
  for (const id of others) await mergePeople(id, target);
  return "/people";
}

/** Runs `change` on the form's person id, if it has a valid one. */
async function withPerson(
  form: FormData,
  change: (id: number) => Promise<void>,
): Promise<string> {
  const id = Number(form.get("id"));
  if (Number.isFinite(id)) await change(id);
  return "/people";
}

type PageData = Awaited<ReturnType<typeof loadPeople>>;

export default define.page<typeof handler>(function People({ data }) {
  const { rows, everyone, filter, duplicates, added, already } = data;

  return (
    <>
      <header class="page-head page-head-row">
        <div>
          <h1>People</h1>
          <p class="page-sub">
            {everyone.length} {everyone.length === 1 ? "person" : "people"}{" "}
            · everyone who presents or might.
          </p>
        </div>
        <form method="get" role="search" class="w-full sm:w-64">
          <input
            type="search"
            name="q"
            value={filter}
            placeholder="Filter by name…"
            aria-label="Filter people"
            class="ui-input"
          />
        </form>
      </header>

      {duplicates.map((group) => (
        <DuplicateCard key={group.map((g) => g.id).join("-")} group={group} />
      ))}

      <div class="mb-5">
        <QuickAdd
          action="/people"
          intent="create"
          name="name"
          autofocus={!filter}
          placeholder="Add a colleague…"
          label="Add"
        />
        {added && (
          <p class="ui-hint mt-2">
            {already ? "Already had " : "Added "}
            <strong class="text-text">{added}</strong>{" "}
            — keep typing to add another.
          </p>
        )}
      </div>

      {rows.length === 0
        ? (
          <div class="ui-empty">
            {filter
              ? "Nobody matches that name."
              : "Nobody yet. Add a few above, or they'll appear as you put speakers on subjects."}
          </div>
        )
        : (
          <ul class="card-grid">
            {rows.map((row) => (
              <PersonCard key={row.id} row={row} everyone={everyone} />
            ))}
          </ul>
        )}

      <p class="ui-hint mt-4">
        Merging folds one person into another and moves their subjects across.
        Only someone with no subjects can be deleted.
      </p>
    </>
  );
});

type PersonRow = PageData["rows"][number];

/** A person: avatar, inline rename, their subjects, merge and delete. */
function PersonCard({ row, everyone }: {
  row: PersonRow;
  everyone: { id: number; name: string }[];
}) {
  return (
    <li class="ui-card person-card">
      <div class="flex items-center gap-3">
        <Avatar name={row.name} personId={row.id} large />
        <div class="min-w-0 flex-1">
          <form method="post">
            <input type="hidden" name="intent" value="rename" />
            <input type="hidden" name="id" value={row.id} />
            <InlineText
              name="name"
              value={row.name}
              ariaLabel={`Rename ${row.name}`}
              class="person-name"
            />
          </form>
          <p class="ui-hint">
            {row.subjects.length} subject{row.subjects.length === 1 ? "" : "s"}
            {" · "}
            {row.presented} presented
          </p>
        </div>
      </div>

      {row.subjects.length > 0 && (
        <div class="flex flex-wrap gap-1.5">
          {row.subjects.map((s) => (
            <a
              key={s.id}
              href={`/subjects/${s.id}`}
              class={`ui-chip ui-chip-${s.stage}`}
            >
              {s.title}
            </a>
          ))}
        </div>
      )}

      <div class="card-foot">
        {everyone.length > 1 && (
          <form method="post">
            <input type="hidden" name="intent" value="merge" />
            <input type="hidden" name="id" value={row.id} />
            <AutoSubmitSelect
              name="target"
              value=""
              ariaLabel={`Merge ${row.name} into someone else`}
              class="ui-select ui-select-sm"
              options={[
                { value: "", label: "Merge into…" },
                ...everyone
                  .filter((p) => p.id !== row.id)
                  .map((p) => ({ value: String(p.id), label: p.name })),
              ]}
            />
          </form>
        )}
        {row.subjects.length === 0 && (
          <form method="post">
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={row.id} />
            <button type="submit" class="ui-btn ui-btn-danger">Delete</button>
          </form>
        )}
      </div>
    </li>
  );
}

/**
 * Names that differ only in case or spacing. Pick the spelling to keep; the
 * others fold into it, subjects and all.
 */
function DuplicateCard({ group }: { group: Spelling[] }) {
  const total = group.reduce((sum, g) => sum + g.subjects, 0);
  return (
    <form method="post" class="ui-panel ui-panel-careful mb-5">
      <span class="sticker sticker-corner">DUPLICATE?</span>
      <input type="hidden" name="intent" value="merge-group" />
      <h2 class="text-lg">Same person, different spellings</h2>
      <div class="mt-3 flex flex-wrap gap-2">
        {group.map((g, i) => (
          <label key={g.id} class="radio-pill">
            <input type="hidden" name="member" value={g.id} />
            <input
              type="radio"
              name="target"
              value={g.id}
              checked={i === 0}
            />
            <span class="font-display font-bold">{g.name}</span>
            <span class="ui-hint">
              {g.subjects} subject{g.subjects === 1 ? "" : "s"}
            </span>
          </label>
        ))}
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" class="ui-btn ui-btn-primary">Merge</button>
        <span class="ui-hint">
          Keeps the selected spelling. All {total}{" "}
          subject{total === 1 ? "" : "s"} move to it.
        </span>
      </div>
    </form>
  );
}
