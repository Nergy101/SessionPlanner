import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  addPerson,
  deletePerson,
  listPeople,
  mergePeople,
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
      listSubjects({ includeArchived: true }),
    ]);

    // One pass, rather than a query per person.
    const rows = people.map((person) => {
      const theirs = subjects.filter((s) =>
        s.people.some((p) => p.id === person.id)
      );
      const dates = theirs
        .filter((s) =>
          (s.status === "presented" || s.status === "archived") && s.sessionDate
        )
        .map((s) => s.sessionDate!)
        .sort();

      return {
        id: person.id,
        name: person.name,
        subjects: theirs
          .slice()
          .sort((a, b) => a.status.localeCompare(b.status))
          .map((s) => ({ id: s.id, title: s.title, status: s.status })),
        lastPresented: dates.length ? dates[dates.length - 1] : null,
      };
    });

    return page({
      rows,
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
  const { rows, added, already } = data;

  return (
    <>
      <div class="mb-6">
        <h1 class="text-2xl">people</h1>
        <p class="mt-1 max-w-2xl text-slate-600 dark:text-slate-400">
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
            <strong class="text-slate-900 dark:text-slate-100">{added}</strong>
            {" "}
            — keep typing to add another.
          </p>
        )}
      </div>

      {rows.length === 0
        ? (
          <div class="ui-empty">
            Nobody yet. Add a few above, or they'll appear here as you assign
            them to subjects.
          </div>
        )
        : (
          <div class="ui-table-wrap overflow-x-auto">
            <table class="w-full border-collapse">
              <thead>
                <tr>
                  <th class="ui-th w-56">Name</th>
                  <th class="ui-th">Subjects</th>
                  <th class="ui-th w-32">Last presented</th>
                  <th class="ui-th w-56"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    class="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td class="ui-td">
                      <form method="post">
                        <input type="hidden" name="intent" value="rename" />
                        <input type="hidden" name="id" value={row.id} />
                        <InlineText
                          name="name"
                          value={row.name}
                          ariaLabel="Name"
                        />
                      </form>
                    </td>

                    <td class="ui-td">
                      {row.subjects.length
                        ? (
                          <div class="flex flex-wrap gap-1">
                            {row.subjects.map((s) => (
                              <a
                                key={s.id}
                                href={`/subjects/${s.id}`}
                                class="ui-chip"
                              >
                                <StatusBadge status={s.status} />
                                {s.title}
                              </a>
                            ))}
                          </div>
                        )
                        : <span class="ui-hint">—</span>}
                    </td>

                    <td class="ui-td ui-hint">
                      {row.lastPresented
                        ? new Date(`${row.lastPresented}T00:00:00`)
                          .toLocaleDateString(
                            "en-GB",
                            { month: "short", year: "numeric" },
                          )
                        : "never"}
                    </td>

                    <td class="ui-td">
                      <div class="flex flex-wrap items-center gap-2">
                        {rows.length > 1 && (
                          <form method="post">
                            <input type="hidden" name="intent" value="merge" />
                            <input type="hidden" name="id" value={row.id} />
                            <AutoSubmitSelect
                              name="target"
                              value=""
                              ariaLabel={`Merge ${row.name} into someone else`}
                              class="ui-select w-auto min-w-[9rem] text-[0.7rem]"
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
                              class="ui-btn ui-btn-sm ui-btn-ghost ui-btn-danger"
                            >
                              delete
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
