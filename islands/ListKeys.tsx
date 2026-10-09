import { useEffect } from "preact/hooks";

/**
 * Keyboard moves for the subjects list. "/" focuses the search; ↓ from the
 * search enters the rows, ↑↓ walk them, ↑ on the first row returns to the
 * search; Esc in a non-empty search clears it. Rows are real links, so Enter
 * opens them with or without this island.
 */
export function ListKeys() {
  useEffect(() => {
    const search = document.querySelector<HTMLInputElement>(
      "[data-search='subjects']",
    );
    const rows = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-row='subjects']"),
      );

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (e.key === "/" && !typing && search) {
        e.preventDefault();
        search.focus();
        search.select();
        return;
      }

      if (target === search) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          rows()[0]?.focus();
        } else if (e.key === "Escape" && search?.value) {
          e.preventDefault();
          search.value = "";
          search.form?.requestSubmit();
        }
        return;
      }

      if (target.matches("[data-row='subjects']")) {
        const list = rows();
        const i = list.indexOf(target);
        if (e.key === "ArrowDown") {
          e.preventDefault();
          list[i + 1]?.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (i === 0) search?.focus();
          else list[i - 1]?.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return null;
}

export default ListKeys;
