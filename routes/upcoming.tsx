import { HttpError, page } from "fresh";
import { define } from "@/utils.ts";
import { PersonAvatar } from "@/components/PersonAvatar.tsx";
import ThemeToggle from "@/islands/ThemeToggle.tsx";
import { formatLongDate, getUpcomingSessions } from "@/services/sessions.ts";
import { publicPageEnabled, publicSessions } from "@/services/public_page.ts";

/**
 * The shareable "what's coming up" page (NER-332): read-only, no login, and
 * off by default — see PUBLIC_PAGE in the README. It deliberately renders the
 * stripped view from services/public_page.ts, so the organiser's internal
 * fields have no way to reach it.
 */
export const handler = define.handlers({
  async GET() {
    if (!publicPageEnabled()) throw new HttpError(404);
    return page({ sessions: publicSessions(await getUpcomingSessions()) });
  },
});

export default define.page<typeof handler>(function Upcoming({ data }) {
  return (
    <div class="upcoming-page">
      <header class="upcoming-top">
        <a href="/" class="sp-logo" aria-label="session planner – dashboard">
          <span class="sp-mark" style="--s:26px" aria-hidden="true">
            <span class="sp-sq"></span>
            <span class="sp-ci"></span>
          </span>
          <span class="sp-word">session planner</span>
        </a>
        <div class="flex items-center gap-2">
          <ThemeToggle />
          <a href="/login" class="ui-btn ui-btn-ghost">Log in</a>
        </div>
      </header>

      <main class="upcoming-main">
        <h1>Upcoming sessions</h1>
        <p class="page-sub">
          Everything still ahead, in running order. You don't need the
          password to read this page.
        </p>

        {data.sessions.length === 0
          ? (
            <p class="ui-empty mt-8">
              No sessions announced yet.
            </p>
          )
          : (
            <ul class="up-list">
              {data.sessions.map((session) => (
                <li class="ui-card up-card" key={session.id}>
                  <div class="up-card-head">
                    <h2>
                      {formatLongDate(session.date)}
                      {session.startTime && (
                        <span class="text-muted">
                          {" · "}
                          {session.startTime}
                        </span>
                      )}
                    </h2>
                    <a
                      class="ui-btn ui-btn-ghost"
                      href={`/upcoming/${session.id}/ics`}
                    >
                      Add to calendar
                    </a>
                  </div>

                  {session.subjects.length === 0
                    ? <p class="ui-empty mt-3">Nothing planned yet.</p>
                    : (
                      <ol class="up-subjects">
                        {session.subjects.map((subject, i) => (
                          <li
                            class="up-subject"
                            key={`${session.id}-${i}-${subject.title}`}
                          >
                            <span class="up-order" aria-hidden="true">
                              {i + 1}
                            </span>
                            <div>
                              <h3>{subject.title}</h3>
                              {subject.description && (
                                <p class="text-muted mt-1">
                                  {subject.description}
                                </p>
                              )}
                              <div class="up-speakers">
                                {subject.speakers.length === 0
                                  ? (
                                    <span class="text-muted text-sm">
                                      speaker to be confirmed
                                    </span>
                                  )
                                  : subject.speakers.map((speaker) => (
                                    <span
                                      class="up-speaker"
                                      key={speaker.id}
                                    >
                                      <PersonAvatar
                                        personId={speaker.id}
                                        size={28}
                                      />
                                      <span>{speaker.name}</span>
                                    </span>
                                  ))}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                </li>
              ))}
            </ul>
          )}

        <p class="up-foot">
          Want to suggest a topic, or claim a slot that has no speaker yet?{" "}
          Use the <a href="/">public dashboard</a>.
        </p>
      </main>
    </div>
  );
});
