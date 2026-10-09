import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  addNote,
  deleteNote,
  listNotes,
  updateNote,
} from "@/services/notes.ts";
import ConfirmButton from "@/islands/ConfirmButton.tsx";
import NoteEditor from "@/islands/NoteEditor.tsx";
import { formatTimestamp } from "@/services/sessions.ts";

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
      <header class="page-head">
        <h1>Notes</h1>
        <p class="page-sub">
          Private scratch space. Notes never link to subjects or sessions.
        </p>
      </header>

      <form
        method="post"
        class="ui-panel ui-panel-primary note-new"
      >
        <input type="hidden" name="intent" value="create" />
        <NoteEditor
          id="new-note"
          initial=""
          rows={3}
          autofocus
          placeholder="Write whatever comes to mind…"
          saveLabel="Save note"
          saveClass="ui-btn-next"
          meta="ctrl+⏎ to save"
        />
      </form>

      {notes.length === 0
        ? <div class="ui-empty mt-5">No notes yet. Start typing above.</div>
        : (
          <div class="card-grid mt-5">
            {notes.map((note) => (
              <article key={note.id} class="ui-card note-card">
                <form method="post" class="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="id" value={note.id} />
                  <NoteEditor
                    id={`note-${note.id}`}
                    initial={note.body}
                    rows={Math.min(
                      14,
                      Math.max(4, note.body.split("\n").length + 1),
                    )}
                    saveLabel="Save"
                    meta={formatTimestamp(note.updated_at)}
                  >
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Delete"
                      form={`note-delete-${note.id}`}
                    />
                  </NoteEditor>
                </form>
                <form id={`note-delete-${note.id}`} method="post" hidden>
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={note.id} />
                </form>
              </article>
            ))}
          </div>
        )}
    </>
  );
});
