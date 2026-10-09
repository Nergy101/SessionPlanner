import { useSignal } from "@preact/signals";
import { Combobox } from "@/components/Combobox.tsx";

/**
 * The dashboard's capture bar: an idea's title plus, optionally, who presents
 * it, picked from `people` or typed as a new name. A plain POST to /suggest, so
 * without JavaScript it is two text fields and an always-enabled button.
 */
export function CaptureIdea(props: {
  people: string[];
  titleMax: number;
  speakerMax: number;
  autofocus?: boolean;
}) {
  const title = useSignal("");
  const speaker = useSignal("");

  return (
    <form method="post" action="/suggest" class="capture capture-form">
      <input
        type="text"
        name="title"
        required
        maxLength={props.titleMax}
        autofocus={props.autofocus}
        placeholder="Capture an idea… ⏎ to add"
        aria-label="Idea"
        value={title.value}
        onInput={(e) => title.value = e.currentTarget.value}
        class="ui-input capture-input capture-title"
      />
      <div class="capture-speaker">
        <Combobox
          id="capture-speaker"
          name="speaker"
          value={speaker}
          maxLength={props.speakerMax}
          placeholder="Speaker (optional)"
          inputClass="ui-input capture-input"
          newLabel={(name) => `New speaker “${name}”`}
          options={props.people.map((value) => ({ value }))}
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

export default CaptureIdea;
