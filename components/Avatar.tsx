import type { Stage } from "@/services/subjects.ts";

/** First and last word's initials: "Jan de Vries" → "JV", "Jan" → "J". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words.length > 1 ? words.at(-1) : undefined;
  return [words[0], last].map((word) => word?.[0] ?? "").join("")
    .toUpperCase();
}

/** A stable hue per person, spread round the wheel so neighbours differ. */
function personHue(id: number): number {
  return (id * 67) % 360;
}

/**
 * A speaker's initials on a disc: the subject's stage colour on cards, or a
 * per-person hue (pass `personId`) where people are listed on their own. The full
 * name stays readable to screen readers.
 */
export function Avatar({ name, stage, personId, large = false }: {
  name: string;
  stage?: Stage;
  personId?: number;
  large?: boolean;
}) {
  const colour = stage ? ` avatar-${stage}` : "";
  return (
    <span
      class={`avatar${colour}${large ? " avatar-lg" : ""}`}
      style={personId === undefined
        ? undefined
        : `--hue:${personHue(personId)}`}
      title={name}
    >
      {initials(name)}
      <span class="sr-only">{name}</span>
    </span>
  );
}
