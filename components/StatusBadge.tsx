import { STATUS_MEANING, type SubjectStatus } from "@/db/schema.ts";

/** One colour per rung, so the ladder is readable down a list. */
export function StatusBadge({ status }: { status: SubjectStatus }) {
  return (
    <span class={`ui-badge ui-badge-${status}`} title={STATUS_MEANING[status]}>
      {status}
    </span>
  );
}
