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
import { listSubjects } from "@/services/subjects.ts";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import InlineText from "@/islands/InlineText.tsx";
import AutoSubmitSelect from "@/islands/AutoSubmitSelect.tsx";
import QuickAdd from "@/islands/QuickAdd.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const [people, subjects] = await Promise.all([
      listPeople(),
      listSubjects(),
    ]);

    // One pass, rather than a query per person.
    const rows = people.map((person) => {
      const theirs = subjects.filter((s) =>
        s.people.some((p) => p.id === person.id)
      );
      const dates = theirs
        .filter((s) => s.stage === "presented" && s.sessionDate)
        .map((s) => s.sessionDate!)
        .sort();

      return {
        id: person.id,
        name: person.name,
        subjects: theirs
          .slice()
          .sort((a, b) => a.stage.localeCompare(b.stage))
          .map((s) => ({ id: s.id, title: s.title, stage: s.stage })),
        lastPresented: dates.length ? dates[dates.length - 1] : null,
      };
    });

    // Only names that match exactly once case and spacing are ignored. Anything
    // looser is left to a human, so a merge is never suggested by guesswork.
    const byKey = new Map<string, { id: number; name: string }[]>();
    for (const row of rows) {
      const key = normalizeName(row.name).toLowerCase();
      byKey.set(key, [...(byKey.get(key) ?? []), {
        id: row.id,
        name: row.name,
      }]);
    }
    const duplicates = [...byKey.values()].filter((group) => group.length > 1);

    return page({
      rows,
      duplicates,
      added: ctx.url.searchParams.get("added"),
      already: ctx.url.searchParams.has("already"),
    });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const intent = String(form.get("intent") ?? "");

    // Quick-fire adding, same shape as the subject capture box: straight back to the
    // list with the cursor in the box, so you can type in a whole team in one go.
    if (intent === "create") {
      const name = String(form.get("name") ?? "").trim();
      if (!name) return ctx.redirect("/people", 303);

      const { person, created } = await addPerson(name);
      const params = new URLSearchParams({ added: person.name });
      if (!created) params.set("already", "1");
      return ctx.redirect(`/people?${params}`, 303);
    }

    const id = Number(form.get("id"));
    if (!Number.isFinite(id)) return ctx.redirect("/people", 303);

    switch (intent) {
      case "rename":
        await renamePerson(id, String(form.get("name") ?? ""));
        break;
      case "merge": {
        const target = Number(form.get("target"));
        if (Number.isFinite(target)) await mergePeople(id, target);
        break;
      }
      case "delete":
        await deletePerson(id);
        break;
    }

    return ctx.redirect("/people", 303);
  },
});

export default define.page<typeof handler>(function People({ data }) {
  const { rows, duplicates, added, already } = data;

  return (
    <>
      <div class="mb-6">
        <h1 class="text-3xl tracking-tight">people</h1>
        <p class="mt-1 max-w-2xl text-muted">
          Everyone who can present. Add colleagues up front so they're one click
          away when you assign a topic — or let them appear as you type names
          onto subjects.
        </p>
      </div>

      <div class="mb-6">
        <QuickAdd
          action="/people"
          intent="create"
          name="name"
          autofocus
          placeholder="add a colleague…"
          label="add"
        />
        {added && (
          <p class="ui-hint mt-2">
            {already ? "already had " : "added "}
            <strong class="text-text">{added}</strong>{" "}
            — keep typing to add another.
          </p>
        )}
      </div>

      {duplicates.length > 0 && (
        <aside class="mb-6 border-2 border-line bg-careful p-4 text-[#111]">
          <h2 class="text-[#111]">possible duplicates</h2>
          <ul class="mt-2 flex flex-col gap-1">
            {duplicates.map((group) => (
              <li key={group.map((g) => g.id).join("-")}>
                {group.map((g) =>
                  g.name
                ).join(" · ")}
              </li>
            ))}
          </ul>
          <p class="mt-2 text-sm">
            Merge one into the other from its card below.
          </p>
        </aside>
      )}

      {rows.length === 0
        ? (
          <div class="ui-empty">
            Nobody yet. Add a few above, or they'll appear here as you assign
            them to subjects.
          </div>
        )
        : (
          <ul class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <li key={row.id} class="ui-card">
                <form method="post">
                  <input type="hidden" name="intent" value="rename" />
                  <input type="hidden" name="id" value={row.id} />
                  <InlineText name="name" value={row.name} ariaLabel="Name" />
                </form>

                <p class="ui-hint">
                  {row.subjects.length}{" "}
                  subject{row.subjects.length === 1 ? "" : "s"}
                  {" · last presented "}
                  {row.lastPresented
                    ? new Date(`${row.lastPresented}T00:00:00`)
                      .toLocaleDateString(
                        "en-GB",
                        { month: "short", year: "numeric" },
                      )
                    : "never"}
                </p>

                {row.subjects.length > 0 && (
                  <div class="flex flex-wrap gap-1">
                    {row.subjects.map((s) => (
                      <a key={s.id} href={`/subjects/${s.id}`} class="ui-chip">
                        <StatusBadge stage={s.stage} />
                        {s.title}
                      </a>
                    ))}
                  </div>
                )}

                <div class="mt-auto flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-2">
                  {rows.length > 1 && (
                    <form method="post">
                      <input type="hidden" name="intent" value="merge" />
                      <input type="hidden" name="id" value={row.id} />
                      <AutoSubmitSelect
                        name="target"
                        value=""
                        ariaLabel={`Merge ${row.name} into someone else`}
                        class="ui-select w-auto min-w-[9rem] text-[0.8rem]"
                        options={[
                          { value: "", label: "merge into…" },
                          ...rows
                            .filter((r) => r.id !== row.id)
                            .map((r) => ({
                              value: String(r.id),
                              label: r.name,
                            })),
                        ]}
                      />
                    </form>
                  )}

                  {row.subjects.length === 0 && (
                    <form method="post">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        class="ui-btn ui-btn-sm ui-btn-danger"
                      >
                        delete
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

      {rows.length > 0 && (
        <p class="ui-hint mt-3">
          {rows.length} {rows.length === 1 ? "person" : "people"}{" "}
          · merging folds one into another and moves their subjects across.
        </p>
      )}
    </>
  );
});
