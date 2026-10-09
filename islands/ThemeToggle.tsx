import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

/**
 * Light / Dark segmented switch. Reads and writes `data-theme` on <html>; the
 * first paint is set by the head script in routes/_app.tsx. The sidebar and the
 * mobile menu both render this, so each change is broadcast to keep them in step.
 */
export function ThemeToggle() {
  const dark = useSignal(false);

  useEffect(() => {
    dark.value = document.documentElement.getAttribute("data-theme") === "dark";
    const sync = (e: Event) => {
      dark.value = (e as CustomEvent<boolean>).detail;
    };
    document.addEventListener("sp-theme", sync);
    return () => document.removeEventListener("sp-theme", sync);
  }, []);

  const set = (on: boolean) => {
    document.documentElement.setAttribute("data-theme", on ? "dark" : "light");
    try {
      localStorage.setItem("sp-theme", on ? "dark" : "light");
    } catch { /* private mode */ }
    document.dispatchEvent(new CustomEvent("sp-theme", { detail: on }));
  };

  return (
    <div class="segmented" role="group" aria-label="Theme">
      <button
        type="button"
        aria-pressed={!dark.value}
        onClick={() => set(false)}
      >
        ◐ Light
      </button>
      <button
        type="button"
        aria-pressed={dark.value}
        onClick={() => set(true)}
      >
        ◑ Dark
      </button>
    </div>
  );
}

export default ThemeToggle;
