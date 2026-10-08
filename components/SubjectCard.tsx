import type { ComponentChildren } from "preact";
import { linkLabel, type Subject } from "@/services/subjects.ts";
import { StatusBadge } from "./StatusBadge.tsx";

const LINK_PREVIEW = 3;

/**
 * `children` render at the bottom of the card, for per-view actions. `linked`
 * turns the title off as a link, for visitors who can't open the subject page.
 */
export function SubjectCard(
  { subject, children, linked = true }: {
    subject: Subject;
    children?: ComponentChildren;
    linked?: boolean;
  },
) {
  const titleClass = "text-sm font-bold leading-snug text-text";
  return (
    <article class="ui-card">
      <div class="flex items-start justify-between gap-2">
        {linked
          ? (
            <a
              href={`/subjects/${subject.id}`}
              class={`${titleClass} no-underline hover:underline`}
            >
              {subject.title}
            </a>
          )
          : <span class={titleClass}>{subject.title}</span>}
        <StatusBadge stage={subject.stage} />
      </div>

      {subject.description && (
        <p class="line-clamp-3 text-[0.82rem] text-muted">
          {subject.description}
        </p>
      )}

      <div class="mt-auto flex items-center justify-between gap-2 border-t border-dashed border-line pt-2">
        {subject.people.length
          ? (
            <div class="flex flex-wrap gap-1">
              {subject.people.map((p) => (
                <span key={p.id} class="ui-chip ui-chip-person">{p.name}</span>
              ))}
            </div>
          )
          : <span class="ui-badge ui-badge-danger">needs a speaker</span>}
      </div>

      {subject.links.length > 0 && (
        <div class="mt-2 flex flex-wrap gap-1.5">
          {subject.links.slice(0, LINK_PREVIEW).map((l) => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              class="ui-chip"
            >
              {linkLabel(l)} ↗
            </a>
          ))}
          {subject.links.length > LINK_PREVIEW && (
            <span class="ui-chip">
              +{subject.links.length - LINK_PREVIEW} more
            </span>
          )}
        </div>
      )}

      {children}
    </article>
  );
}
