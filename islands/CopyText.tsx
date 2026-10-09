import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

/**
 * Copies `text` to the clipboard. The button only enables once hydrated, since
 * copying needs JavaScript; the page shows the same text for selecting by hand.
 */
export function CopyText(props: { text: string; label: string }) {
  const ready = useSignal(false);
  const copied = useSignal(false);
  useEffect(() => {
    ready.value = "clipboard" in navigator;
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    setTimeout(() => copied.value = false, 2000);
  }

  return (
    <button
      type="button"
      class="ui-btn ui-btn-sm"
      disabled={!ready.value}
      onClick={copy}
    >
      {copied.value ? "✓ Copied" : props.label}
    </button>
  );
}

export default CopyText;
