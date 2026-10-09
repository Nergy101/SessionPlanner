import type { ComponentChildren } from "preact";
import {
  idleSticker,
  linkLabel,
  searchText,
  type Subject,
} from "@/services/subjects.ts";
import { PersonAvatar } from "./PersonAvatar.tsx";

/** Links shown on a card before "+N more". */
const LINK_PREVIEW = 3;

/**
 * One subject on the dashboard board. `children` is the lane's single next-step
 * control, shown on the right of the card's footer. `linked` is off for signed-out
 * visitors, who can't open subject pages.
 */
export function BoardCard({ subject, linked, children }: {
  subject: Subject;
  linked: boolean;
  children?: ComponentChildren;
}) {
  const idle = idleSticker(subject);
  const shown = subject.links.slice(0, LINK_PREVIEW);
  const more = subject.links.length - shown.length;

  return (
    <article class="board-card" data-search={searchText(subject)}>
      {idle !== null && (
        <span class="sticker sticker-corner">idle {idle}d!</span>
      )}

      {linked
        ? (
          <a href={`/subjects/${subject.id}`} class="board-card-title">
            {subject.title}
          </a>
        )
        : <span class="board-card-title">{subject.title}</span>}

      {shown.length > 0 && (
        <div class="flex flex-wrap gap-1.5">
          {shown.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              class="ui-chip"
            >
              {linkLabel(link)} ↗
            </a>
          ))}
          {more > 0 && <span class="ui-chip ui-chip-more">+{more} more</span>}
        </div>
      )}

      <div class="board-foot">
        <div class="board-people">
          {subject.people.length
            ? subject.people.map((person) => (
              <span key={person.id} class="board-person">
                <PersonAvatar personId={person.id} size={24} />
                <span>{person.name}</span>
              </span>
            ))
            : (
              <span class="board-person text-muted">
                <span class="avatar avatar-empty" aria-hidden="true" />
                <span>no speaker yet</span>
              </span>
            )}
        </div>
        {children}
      </div>
    </article>
  );
}
