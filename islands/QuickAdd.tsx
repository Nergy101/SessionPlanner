import { useSignal } from "@preact/signals";

/**
 * A one-line create box.
 *
 * The <form> does the real work: it's a plain POST, so Enter submits and the field
 * autofocuses through native HTML with no JavaScript involved. This island exists
 * only to disable the button until there's something to submit — so with JS off,
 * the form still works and the button is simply always enabled.
 */
export function QuickAdd(props: {
  action: string;
  name?: string;
  placeholder?: string;
  label?: string;
  autofocus?: boolean;
  /** Lets one route handler tell this apart from the page's other POSTs. */
  intent?: string;
}) {
  const value = useSignal("");
  const name = props.name ?? "title";

  return (
    <form method="post" action={props.action} class="flex flex-wrap gap-2">
      {props.intent && (
        <input type="hidden" name="intent" value={props.intent} />
      )}
      <input
        type="text"
        name={name}
        required
        autofocus={props.autofocus}
        placeholder={props.placeholder ?? "Add a topic idea…"}
        aria-label={props.placeholder ?? "Add a topic idea"}
        value={value.value}
        onInput={(e) => value.value = e.currentTarget.value}
        class="ui-input min-w-[16rem] flex-1"
      />
      <button
        type="submit"
        class="ui-btn ui-btn-primary"
        disabled={!value.value.trim()}
      >
        {props.label ?? "add"}
      </button>
    </form>
  );
}

export default QuickAdd;
