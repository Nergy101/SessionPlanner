import type { Stage } from "@/services/subjects.ts";

/** First and last word's initials: "Jan de Vries" → "JV", "Jan" → "J". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.at(-1) : undefined;
  return [words[0], last].map((word) => word?.[0] ?? "").join("")
    .toUpperCase();
}

/**
 * A speaker's initials on a disc in the subject's stage colour. The full name
 * stays readable to screen readers.
 */
export function Avatar({ name, stage }: { name: string; stage?: Stage }) {
  const colour = stage ? ` avatar-${stage}` : "";
  return (
    <span class={`avatar${colour}`} title={name}>
      {initials(name)}
      <span class="sr-only">{name}</span>
    </span>
  );
}
