import type { ComponentChildren } from "preact";
import type { Subject } from "@/services/subjects.ts";
import { StatusBadge } from "./StatusBadge.tsx";

/** `children` render at the bottom of the card, for per-view actions. */
export function SubjectCard(
  { subject, children }: { subject: Subject; children?: ComponentChildren },
) {
  return (
    <article class="ui-card">
      <div class="flex items-start justify-between gap-2">
        <a
          href={`/subjects/${subject.id}`}
          class="font-mono text-sm font-semibold leading-snug text-slate-900 no-underline hover:text-brand dark:text-slate-100"
        >
          {subject.title}
        </a>
        <StatusBadge status={subject.status} />
      </div>

      {subject.description && (
        <p class="line-clamp-3 text-[0.82rem] text-slate-600 dark:text-slate-400">
          {subject.description}
        </p>
      )}

      <div class="mt-auto flex items-center justify-between gap-2 border-t border-dashed border-slate-200 pt-2 dark:border-slate-700/70">
        {subject.people.length
          ? (
            <div class="flex flex-wrap gap-1">
              {subject.people.map((p) => (
                <span key={p.id} class="ui-chip ui-chip-person">{p.name}</span>
              ))}
            </div>
          )
          : <span class="ui-badge ui-badge-danger">needs a speaker</span>}

        {subject.links.length > 0 && (
          <span class="ui-chip">
            {subject.links.length} link{subject.links.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {children}
    </article>
  );
}
