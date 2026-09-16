import type { Signal } from "@preact/signals";
import { useSignal } from "@preact/signals";
import { useRef } from "preact/hooks";

export interface ComboOption {
  value: string;
  /** Secondary text shown on the right of the row, e.g. who's already on a topic. */
  hint?: string;
}

/**
 * A single-value type-ahead: filter a scrollable list as you type, pick with the
 * mouse or the keyboard, or ignore the list entirely and type something new.
 *
 * This is an interactive component, **not** an island — it has to be rendered inside
 * one (see islands/NewSession.tsx) so it hydrates, and so the parent can read the
 * chosen value from the signal it passes in.
 *
 * It replaced `<input list>` + `<datalist>`, which is tempting because it needs no
 * JavaScript, but browsers disagree wildly about how it filters, whether the list
 * scrolls, and whether it opens at all — and none of them let you style it.
 *
 * The input carries the form field, so whatever is in the box is what submits:
 * a picked option and a freshly typed name travel identically.
 */
export function Combobox(props: {
  id: string;
  name: string;
  /** Owned by the parent island, so it can react to the choice. */
  value: Signal<string>;
  options: ComboOption[];
  placeholder?: string;
  autofocus?: boolean;
  /** Shown as the last row when the typed text matches nothing. */
  newLabel?: (typed: string) => string;
}) {
  const open = useSignal(false);
  const highlight = useSignal(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const typed = props.value.value.trim();
  const lower = typed.toLowerCase();

  const matches = typed
    ? props.options.filter((o) => o.value.toLowerCase().includes(lower))
    : props.options;

  const exact = props.options.some((o) => o.value.toLowerCase() === lower);
  const offersNew = typed.length > 0 && !exact;

  const rows: Array<ComboOption & { isNew?: boolean }> = offersNew
    ? [...matches, { value: typed, isNew: true }]
    : matches;

  function choose(row: { value: string }) {
    props.value.value = row.value;
    open.value = false;
    highlight.value = -1;
  }

  return (
    <div class="relative">
      <input
        id={props.id}
        name={props.name}
        type="text"
        role="combobox"
        aria-expanded={open.value}
        aria-controls={`${props.id}-listbox`}
        aria-autocomplete="list"
        autocomplete="off"
        autofocus={props.autofocus}
        placeholder={props.placeholder}
        value={props.value.value}
        class="ui-input"
        onFocus={() => {
          open.value = true;
          highlight.value = -1;
        }}
        onBlur={() => {
          // Let a click on a row land before the menu closes.
          blurTimer.current = setTimeout(() => open.value = false, 150);
        }}
        onInput={(e) => {
          props.value.value = e.currentTarget.value;
          open.value = true;
          highlight.value = -1;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            open.value = true;
            if (!rows.length) return;
            const step = e.key === "ArrowDown" ? 1 : -1;
            highlight.value = (highlight.value + step + rows.length) %
              rows.length;
          } else if (e.key === "Enter") {
            // Only swallow Enter when it's actually picking something. Otherwise it
            // belongs to the form, and typing a new value then pressing Enter
            // should submit rather than trap you in the box.
            if (open.value && highlight.value >= 0 && rows[highlight.value]) {
              e.preventDefault();
              choose(rows[highlight.value]);
            } else {
              open.value = false;
            }
          } else if (e.key === "Escape") {
            e.preventDefault();
            open.value = false;
            highlight.value = -1;
          }
        }}
      />

      {open.value && rows.length > 0 && (
        <ul
          id={`${props.id}-listbox`}
          role="listbox"
          class="absolute inset-x-0 top-full z-40 mt-0.5 max-h-56 overflow-y-auto rounded-md border border-dashed border-slate-300 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-900"
        >
          {rows.map((row, i) => (
            <li
              key={`${row.value}-${row.isNew ? "new" : "opt"}`}
              role="option"
              aria-selected={i === highlight.value}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus, so blur doesn't race the click
                clearTimeout(blurTimer.current);
                choose(row);
              }}
              onMouseEnter={() => highlight.value = i}
              class={`flex cursor-pointer items-center justify-between gap-3 border-t border-dashed border-slate-200 px-2.5 py-1.5 font-mono text-[0.78rem] first:border-t-0 dark:border-slate-700 ${
                i === highlight.value
                  ? "bg-brand/15 text-brand"
                  : "text-slate-700 dark:text-slate-300"
              }`}
            >
              {row.isNew
                ? (
                  <span>
                    + {props.newLabel?.(row.value) ?? `use “${row.value}”`}
                  </span>
                )
                : (
                  <>
                    <span class="truncate">{row.value}</span>
                    {row.hint && (
                      <span class="shrink-0 text-[0.7rem] opacity-60">
                        {row.hint}
                      </span>
                    )}
                  </>
                )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
