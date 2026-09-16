import { useSignal } from "@preact/signals";

interface Row {
  url: string;
  label: string;
}

/**
 * Add and remove link rows. The rows are plain inputs named `linkUrl` / `linkLabel`,
 * so they arrive at the handler as two parallel arrays and the enclosing form saves
 * them along with everything else.
 */
export function LinkEditor(props: { initial: Row[] }) {
  const rows = useSignal<Row[]>(props.initial.length ? props.initial : []);

  const update = (i: number, patch: Partial<Row>) => {
    rows.value = rows.value.map((r, n) => n === i ? { ...r, ...patch } : r);
  };

  return (
    <div class="flex flex-col gap-2">
      {rows.value.map((row, i) => (
        <div key={i} class="flex items-end gap-2">
          <div class="flex-1">
            {i === 0 && <label class="ui-label">URL</label>}
            <input
              type="url"
              name="linkUrl"
              value={row.url}
              placeholder="https://…"
              aria-label="Link URL"
              class="ui-input"
              onInput={(e) => update(i, { url: e.currentTarget.value })}
            />
          </div>

          <div class="flex-1">
            {i === 0 && (
              <label class="ui-label">
                Label <span class="ui-label-hint">(optional)</span>
              </label>
            )}
            <input
              type="text"
              name="linkLabel"
              value={row.label}
              placeholder="defaults to the host name"
              aria-label="Link label"
              class="ui-input"
              onInput={(e) => update(i, { label: e.currentTarget.value })}
            />
          </div>

          <button
            type="button"
            aria-label="Remove link"
            title="Remove link"
            class="ui-btn ui-btn-ghost ui-btn-danger"
            onClick={() => rows.value = rows.value.filter((_, n) => n !== i)}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        </div>
      ))}

      <button
        type="button"
        class="ui-btn ui-btn-ghost self-start"
        onClick={() => rows.value = [...rows.value, { url: "", label: "" }]}
      >
        + add link
      </button>
    </div>
  );
}

export default LinkEditor;
