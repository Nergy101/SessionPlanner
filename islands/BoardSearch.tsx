import { useSignal } from "@preact/signals";

/**
 * The dashboard's search. It is a plain GET form, so without JavaScript Enter
 * reloads the board filtered by the server. With it, cards filter as you
 * type: each card carries its own lower-case `data-search` text, and the lane
 * counts and tab links follow along. Esc clears.
 */
export function BoardSearch(props: { query: string; lane: string }) {
  const query = useSignal(props.query);

  function update(value: string) {
    query.value = value;
    filterBoard(value.trim().toLowerCase());
    syncUrl(value.trim());
  }

  return (
    <form method="get" action="/" class="board-search" role="search">
      <input type="hidden" name="lane" value={props.lane} />
      <input
        type="search"
        name="q"
        value={query.value}
        placeholder="Filter cards by title, speaker or description…"
        aria-label="Filter cards"
        autocomplete="off"
        class="ui-input"
        onInput={(e) => update(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Escape" && update("")}
      />
    </form>
  );
}

/** Hides non-matching cards, then the counts and groups follow. */
function filterBoard(needle: string) {
  for (const card of document.querySelectorAll<HTMLElement>("[data-search]")) {
    card.hidden = !card.dataset.search!.includes(needle);
  }
  recountLanes();
  hideEmptyGroups();
}

/** Each lane's count (in its head and its tab) becomes its visible cards. */
function recountLanes() {
  for (const lane of document.querySelectorAll<HTMLElement>("[data-lane]")) {
    const shown = lane.querySelectorAll("[data-search]:not([hidden])").length;
    const counts = `[data-lane-count="${lane.dataset.lane}"]`;
    for (const count of document.querySelectorAll(counts)) {
      count.textContent = String(shown);
    }
  }
}

/** A session group in the planned lane hides once none of its cards show. */
function hideEmptyGroups() {
  for (const group of document.querySelectorAll<HTMLElement>("[data-group]")) {
    group.hidden = !group.querySelector("[data-search]:not([hidden])");
  }
}

/** Keeps ?q in the address bar and the lane tabs, so reloads keep the filter. */
function syncUrl(query: string) {
  history.replaceState(null, "", withQuery(location.href, query));
  for (
    const tab of document.querySelectorAll<HTMLAnchorElement>("[data-lane-tab]")
  ) tab.href = withQuery(tab.href, query);
}

/** `href` with ?q set to `query`, or without ?q when it is empty. */
function withQuery(href: string, query: string): string {
  const url = new URL(href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  return url.pathname + url.search;
}

export default BoardSearch;
