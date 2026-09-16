import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * A text cell that looks like text until you hover it, and commits on Enter or on
 * leaving the field — but only if you actually changed something.
 *
 * With `autosave` (ms) it also saves on its own once you pause, in the background
 * rather than by reloading the page, so a value nudged with the arrow keys is kept
 * even if you never leave the field. Leaving the page mid-pause still sends it.
 */
export function InlineText(props: {
  name: string;
  value: string;
  ariaLabel: string;
  type?: "text" | "number";
  min?: number;
  step?: number;
  /** Extra classes, e.g. a narrower width for a number. */
  class?: string;
  /** Debounce in ms for a background save; off when unset. */
  autosave?: number;
}) {
  const original = props.value;
  const value = useSignal(props.value);
  const state = useSignal<SaveState>("idle");
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // What the server has now; autosave moves this on without a reload.
  const saved = useRef(original);

  const dirty = () =>
    value.value.trim() !== "" && value.value !== saved.current;

  async function saveInBackground() {
    clearTimeout(timer.current);
    const form = input.current?.form;
    if (!form || !dirty()) return;

    const sent = value.value;
    const before = saved.current;
    saved.current = sent;
    state.value = "saving";
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        // The handler answers with a 303 back to the page; no need to fetch it.
        redirect: "manual",
      });
      if (res.type !== "opaqueredirect" && !res.ok) throw new Error();
      // A newer edit may already be pending; only report on the latest one.
      if (value.value === sent) state.value = "saved";
    } catch {
      saved.current = before;
      state.value = "error";
    }
  }

  const commit = (el: HTMLInputElement) => {
    if (props.autosave !== undefined) {
      saveInBackground();
    } else if (dirty()) {
      el.form?.requestSubmit();
    }
  };

  useEffect(() => {
    if (props.autosave === undefined) return;
    // A pending debounce would die with the page, so hand it to the browser.
    const flush = () => {
      const form = input.current?.form;
      if (!form || !dirty()) return;
      clearTimeout(timer.current);
      navigator.sendBeacon(form.action, new FormData(form));
      saved.current = value.value;
    };
    addEventListener("pagehide", flush);
    return () => {
      removeEventListener("pagehide", flush);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <>
      <input
        ref={input}
        type={props.type ?? "text"}
        name={props.name}
        min={props.min}
        step={props.step}
        value={value.value}
        aria-label={props.ariaLabel}
        onInput={(e) => {
          value.value = e.currentTarget.value;
          if (props.autosave === undefined) return;
          state.value = "idle";
          clearTimeout(timer.current);
          timer.current = setTimeout(saveInBackground, props.autosave);
        }}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(e.currentTarget);
          } else if (e.key === "Escape") {
            clearTimeout(timer.current);
            value.value = saved.current;
            e.currentTarget.blur();
          }
        }}
        class={`ui-input-inline ${props.class ?? ""} ${
          state.value === "error" ? "border-rose-500" : ""
        }`}
      />
      {props.autosave !== undefined && (
        <span
          role="status"
          title={state.value === "error" ? "Not saved — try again" : undefined}
          class={`w-3 font-mono text-[0.7rem] ${
            state.value === "error" ? "text-rose-600" : "text-emerald-600"
          }`}
        >
          {state.value === "saving"
            ? "…"
            : state.value === "saved"
            ? "✓"
            : state.value === "error"
            ? "!"
            : ""}
        </span>
      )}
    </>
  );
}

export default InlineText;
