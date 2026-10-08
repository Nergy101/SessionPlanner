import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  addNote,
  deleteNote,
  listNotes,
  updateNote,
} from "@/services/notes.ts";
import ConfirmButton from "@/islands/ConfirmButton.tsx";

export const handler = define.handlers({
  async GET() {
    return page({ notes: await listNotes() });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const intent = String(form.get("intent") ?? "");
    const body = String(form.get("body") ?? "");

    if (intent === "create") {
      await addNote(body);
      return ctx.redirect("/notes", 303);
    }

    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) return ctx.redirect("/notes", 303);

    switch (intent) {
      case "update":
        await updateNote(id, body);
        break;
      case "delete":
        await deleteNote(id);
        break;
    }
    return ctx.redirect("/notes", 303);
  },
});

export default define.page<typeof handler>(function Notes({ data }) {
  const { notes } = data;

  return (
    <>
      <div class="mb-6">
        <h1 class="text-2xl">notes</h1>
        <p class="mt-1 max-w-2xl text-slate-600 dark:text-slate-400">
          Private scratch space, free-form. Nothing here feeds the planner,
          standings or dashboard. A blank note isn't saved, and clearing a note
          doesn't remove it; use delete for that.
        </p>
      </div>

      <form method="post" class="ui-panel mb-6 flex flex-col gap-3">
        <input type="hidden" name="intent" value="create" />
        <label class="ui-label" for="new-note">new note</label>
        <textarea
          id="new-note"
          name="body"
          rows={4}
          placeholder="write whatever comes to mind…"
          class="ui-textarea"
        />
        <div>
          <button type="submit" class="ui-btn ui-btn-primary">save note</button>
        </div>
      </form>

      {notes.length === 0
        ? <div class="ui-empty">No notes yet. Start typing above.</div>
        : (
          <div class="flex flex-col gap-6">
            {notes.map((note) => (
              <section key={note.id} class="ui-panel flex flex-col gap-3">
                <form method="post" class="flex flex-col gap-3">
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="id" value={note.id} />
                  <label class="ui-label" for={`note-${note.id}`}>
                    written {note.created_at} UTC
                  </label>
                  <textarea
                    id={`note-${note.id}`}
                    name="body"
                    rows={Math.min(
                      20,
                      Math.max(4, note.body.split("\n").length + 1),
                    )}
                    class="ui-textarea"
                  >
                    {note.body}
                  </textarea>
                  <div class="flex items-center gap-3">
                    <button type="submit" class="ui-btn ui-btn-primary">
                      save
                    </button>
                    <span class="ui-hint">
                      last saved {note.updated_at} UTC
                    </span>
                  </div>
                </form>

                <form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={note.id} />
                  <ConfirmButton
                    label="delete note"
                    confirmLabel="yes, delete it"
                  />
                </form>
              </section>
            ))}
          </div>
        )}
    </>
  );
});
