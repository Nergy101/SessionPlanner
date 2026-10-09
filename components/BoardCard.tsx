import type { ComponentChildren } from "preact";
import { idleSticker, linkLabel, type Subject } from "@/services/subjects.ts";
import { Avatar } from "./Avatar.tsx";

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
    <article class="board-card">
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
              <Avatar
                key={person.id}
                name={person.name}
                stage={subject.stage}
              />
            ))
            : (
              <span
                class="avatar avatar-empty"
                role="img"
                aria-label="no speaker yet"
              />
            )}
        </div>
        {children}
      </div>
    </article>
  );
}
