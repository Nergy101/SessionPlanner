import { useSignal } from "@preact/signals";

/**
 * A destructive submit button that asks first.
 *
 * This has to be an island: an onClick on a server-rendered component is never wired
 * up, so the guard would silently do nothing. Rather than a native confirm() dialog,
 * it swaps itself for an inline confirm/cancel pair — no modal, and it degrades to a
 * plain one-click submit if JavaScript never loads.
 */
export function ConfirmButton(props: {
  label: string;
  confirmLabel?: string;
  class?: string;
}) {
  const armed = useSignal(false);

  if (!armed.value) {
    return (
      <button
        type="button"
        class={props.class ?? "ui-btn ui-btn-danger"}
        onClick={() => armed.value = true}
      >
        {props.label}
      </button>
    );
  }

  return (
    <div class="flex flex-wrap items-center gap-2">
      <button type="submit" class="ui-btn ui-btn-danger-solid">
        {props.confirmLabel ?? "yes, delete"}
      </button>
      <button
        type="button"
        class="ui-btn ui-btn-ghost"
        onClick={() => armed.value = false}
      >
        cancel
      </button>
    </div>
  );
}

export default ConfirmButton;
