import { type Stage, STAGE_MEANING } from "@/services/subjects.ts";

/** One colour per stage, so the pipeline reads at a glance. */
export function StatusBadge({ stage }: { stage: Stage }) {
  return (
    <span class={`ui-badge ui-badge-${stage}`} title={STAGE_MEANING[stage]}>
      {stage}
    </span>
  );
}
