import type { Person } from "@/db/schema.ts";

/**
 * Pick a subject's speakers straight from the table row.
 *
 * Deliberately not an island. The native `popover` attribute opens and closes this
 * without any JavaScript, and renders it in the browser's top layer — which is the
 * only way a panel inside a table with `overflow-x-auto` can escape being clipped.
 * The checkboxes are plain form fields, so this *is* a multi-select: submitting
 * replaces the speaker set in one POST.
 *
 * The free-text box shares the `people` field name with the checkboxes, so a name
 * nobody has used yet is created in the same submit. Blank values are dropped
 * server-side.
 */
export function SpeakerSelect(props: {
  subjectId: number;
  subjectTitle: string;
  selected: Person[];
  everyone: Person[];
  /** Where the enclosing form posts back to. */
  action: string;
}) {
  const id = `speakers-${props.subjectId}`;
  const chosen = new Set(props.selected.map((p) => p.name.toLowerCase()));

  return (
    <form method="post" action={props.action} class="flex items-center gap-1.5">
      <input type="hidden" name="intent" value="people" />
      <input type="hidden" name="id" value={props.subjectId} />

      {
        /* The visible label is a row of chips, which reads as nothing to a screen
          reader — hence the explicit aria-label naming both the action and the
          subject it applies to. */
      }
      <button
        type="button"
        popovertarget={id}
        title="Choose speakers"
        aria-label={props.selected.length
          ? `Change speakers for ${props.subjectTitle} (currently ${
            props.selected.map((p) =>
              p.name
            ).join(", ")
          })`
          : `Add a speaker to ${props.subjectTitle}`}
        class="flex flex-wrap items-center gap-1 rounded-md border border-dashed border-transparent px-1 py-0.5 text-left hover:border-slate-300 dark:hover:border-slate-600"
      >
        {props.selected.length
          ? props.selected.map((p) => (
            <span key={p.id} class="ui-chip ui-chip-person">{p.name}</span>
          ))
          : <span class="ui-hint">+ add speaker</span>}
      </button>

      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-label={`Speakers for ${props.subjectTitle}`}
        class="ui-popover"
      >
        <p class="ui-label mb-2" aria-hidden="true">
          speakers for <span class="ui-label-hint">{props.subjectTitle}</span>
        </p>

        {props.everyone.length
          ? (
            <div class="mb-3 max-h-64 overflow-y-auto">
              {props.everyone.map((p) => (
                <label
                  key={p.id}
                  class="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 font-mono text-[0.8rem] hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    name="people"
                    value={p.name}
                    checked={chosen.has(p.name.toLowerCase())}
                    class="accent-brand"
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )
          : (
            <p class="mb-3 text-[0.78rem] text-slate-600 dark:text-slate-400">
              Nobody on the list yet — type a name below, or add people on{" "}
              <a href="/people">the people page</a>.
            </p>
          )}

        <label class="ui-label" for={`${id}-new`}>
          or a new name <span class="ui-label-hint">(created on save)</span>
        </label>
        <input
          id={`${id}-new`}
          type="text"
          name="people"
          autocomplete="off"
          placeholder="Jan de Vries"
          class="ui-input mb-3"
        />

        <div class="flex items-center gap-2">
          <button type="submit" class="ui-btn ui-btn-primary ui-btn-sm">
            save
          </button>
          <button
            type="button"
            popovertarget={id}
            popovertargetaction="hide"
            class="ui-btn ui-btn-sm ui-btn-ghost"
          >
            cancel
          </button>
          <span class="ui-hint ml-auto">unticking removes</span>
        </div>
      </div>
    </form>
  );
}
