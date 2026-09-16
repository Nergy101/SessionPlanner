/**
 * A select that commits as soon as you change it, so the tables stay one-click.
 *
 * It's an island because that's the only way to submit on change; the surrounding
 * <form> is a real POST, so with JS off it still works via the fallback button.
 */
export function AutoSubmitSelect(props: {
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  ariaLabel: string;
  class?: string;
}) {
  return (
    <>
      <select
        name={props.name}
        aria-label={props.ariaLabel}
        value={props.value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        class={props.class ?? "ui-select w-auto min-w-[9rem]"}
      >
        {props.options.map((o) => (
          <option
            key={o.value}
            value={o.value}
            selected={o.value === props.value}
          >
            {o.label}
          </option>
        ))}
      </select>
      {/* Only visible without JS, where onChange can't fire. */}
      <noscript>
        <button type="submit" class="ui-btn ui-btn-sm">set</button>
      </noscript>
    </>
  );
}

export default AutoSubmitSelect;
