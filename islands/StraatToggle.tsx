import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

declare global {
  // Set by static/straat.js.
  var straat: { enabled(): boolean; set(on: boolean): void } | undefined;
}

/**
 * The NL pill for straat-taal. The rewriting itself lives in static/straat.js,
 * which runs before hydration so the page never shows English first; this island
 * only flips it and mirrors the state into every instance on the page.
 */
export function StraatToggle() {
  const on = useSignal(false);

  useEffect(() => {
    on.value = globalThis.straat?.enabled() ?? false;
    const sync = (e: Event) => {
      on.value = (e as CustomEvent<boolean>).detail;
    };
    document.addEventListener("straat", sync);
    return () => document.removeEventListener("straat", sync);
  }, []);

  return (
    <button
      type="button"
      data-no-straat
      aria-pressed={on.value}
      title={on.value ? "Terug naar normaal" : "Straat-taal aan"}
      onClick={() => globalThis.straat?.set(!on.value)}
      class="pill-switch"
    >
      NL
    </button>
  );
}

export default StraatToggle;
