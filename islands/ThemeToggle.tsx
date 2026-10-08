import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";

/** Reads and writes `data-theme` on <html>. The first paint is set by the head script in routes/_app.tsx. */
export function ThemeToggle() {
  const dark = useSignal(false);

  useEffect(() => {
    dark.value = document.documentElement.getAttribute("data-theme") === "dark";
  }, []);

  const apply = (on: boolean) => {
    document.documentElement.setAttribute("data-theme", on ? "dark" : "light");
    try {
      localStorage.setItem("sp-theme", on ? "dark" : "light");
    } catch { /* private mode */ }
  };

  return (
    <button
      type="button"
      title={dark.value ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle theme"
      onClick={() => {
        dark.value = !dark.value;
        apply(dark.value);
      }}
      class="ui-icon-btn"
    >
      {dark.value
        ? (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        )
        : (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
    </button>
  );
}

export default ThemeToggle;
