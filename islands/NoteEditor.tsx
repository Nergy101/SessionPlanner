import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

/**
 * A note's textarea with its save footer. Ctrl/⌘+⏎ saves; Save stays disabled
 * until there is something to save, and an existing note shows whether it has
 * unsaved changes. The enclosing <form> does the saving, so without JavaScript
 * it is a plain textarea and an always-enabled Save button.
 *
 * `meta` is the footer's left-hand text (a date, a hint); `children` follow
 * Save on the right (e.g. Delete).
 */
export function NoteEditor(props: {
  id: string;
  initial: string;
  placeholder?: string;
  saveLabel: string;
  rows: number;
  autofocus?: boolean;
  /** Save button style; primary (yellow) unless it sits on a yellow panel. */
  saveClass?: string;
  meta: string;
  children?: ComponentChildren;
}) {
  const value = useSignal(props.initial);
  const hydrated = useSignal(false);
  useEffect(() => {
    hydrated.value = true;
  }, []);

  const isNew = props.initial === "";
  const dirty = value.value.trim() !== "" && value.value !== props.initial;

  return (
    <>
      <textarea
        id={props.id}
        name="body"
        rows={props.rows}
        autofocus={props.autofocus}
        placeholder={props.placeholder}
        aria-label={isNew ? "New note" : "Note"}
        class="ui-textarea"
        value={value.value}
        onInput={(e) => value.value = e.currentTarget.value}
        onKeyDown={(e) => dirty && submitOnCtrlEnter(e)}
      />
      <div class="note-foot">
        <span class="ui-hint mr-auto">{props.meta}</span>
        {!isNew && hydrated.value && <SaveState dirty={dirty} />}
        <button
          type="submit"
          disabled={hydrated.value && !dirty}
          class={`ui-btn ui-btn-sm ${props.saveClass ?? "ui-btn-primary"}`}
        >
          {props.saveLabel}
        </button>
        {props.children}
      </div>
    </>
  );
}

/** Ctrl/⌘+⏎ submits the textarea's form. */
function submitOnCtrlEnter(
  e: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
) {
  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  e.currentTarget.form?.requestSubmit();
}

function SaveState({ dirty }: { dirty: boolean }) {
  return dirty
    ? <span class="text-xs font-bold text-danger-text">● unsaved</span>
    : <span class="text-xs font-bold text-ok-text">✓ saved</span>;
}

export default NoteEditor;
