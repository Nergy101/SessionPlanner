import { useSignal } from "@preact/signals";
import { Combobox } from "@/components/Combobox.tsx";

/**
 * Type to find a backlog subject, or type a new title to create one straight
 * onto this session. The typed text is what submits; the server schedules an
 * unscheduled subject with exactly that title, or creates it. Without
 * JavaScript it is a plain text field and an always-enabled button.
 */
export function AddSubject(props: {
  sessionId: number;
  backlog: Array<{ title: string; stage: string; stageLabel: string }>;
}) {
  const title = useSignal("");

  return (
    <form method="post" class="flex flex-wrap items-start gap-2">
      <input type="hidden" name="intent" value="add" />
      <div class="min-w-[14rem] flex-1">
        <Combobox
          id="add-subject"
          name="title"
          value={title}
          placeholder="Find a subject, or type a new one…"
          newLabel={(t) =>
            `Create “${t}” as a new subject on #${props.sessionId}`}
          options={props.backlog.map((s) => ({
            value: s.title,
            hint: s.stageLabel,
            hintClass: `ui-badge ui-badge-${s.stage} shrink-0`,
          }))}
        />
      </div>
      <button
        type="submit"
        class="ui-btn ui-btn-primary"
        disabled={!title.value.trim()}
      >
        Add
      </button>
    </form>
  );
}

export default AddSubject;
