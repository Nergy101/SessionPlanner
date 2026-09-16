import { useSignal } from "@preact/signals";
import { Combobox } from "@/components/Combobox.tsx";

interface PoolSubject {
  title: string;
  speakers: string[];
}

/**
 * Book a date, put a topic on it, and give the topic a speaker — in one submit.
 *
 * Both pickers are type-aheads: filter the list as you type, pick with the mouse or
 * the arrow keys, or type something that isn't on it. The server resolves a typed
 * title to an existing subject by exact match, or creates it; same for the speaker.
 *
 * The island exists to answer one question live — does the chosen topic already have
 * a speaker? — so the speaker field can explain itself rather than sit there
 * ambiguously. With JavaScript off the inputs are still plain text fields inside a
 * plain form, and the server does exactly the same work.
 */
export function NewSession(props: {
  defaultDate: string;
  pool: PoolSubject[];
  people: string[];
}) {
  const subject = useSignal("");
  const speaker = useSignal("");

  const byTitle = new Map(props.pool.map((s) => [s.title.toLowerCase(), s]));
  const chosen = byTitle.get(subject.value.trim().toLowerCase());
  const isNewTopic = subject.value.trim().length > 0 && !chosen;
  const alreadyStaffed = chosen !== undefined && chosen.speakers.length > 0;

  return (
    <form method="post" class="ui-panel mb-9">
      <h3 class="mb-3">new session</h3>

      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="ui-label" for="date">Date</label>
          <input
            id="date"
            name="date"
            type="date"
            required
            value={props.defaultDate}
            class="ui-input w-auto"
          />
        </div>

        <div class="min-w-[18rem] flex-1">
          <label class="ui-label" for="subjectTitle">
            Subject{" "}
            <span class="ui-label-hint">(pick one, or type a new topic)</span>
          </label>
          <Combobox
            id="subjectTitle"
            name="subjectTitle"
            value={subject}
            placeholder="what's being presented?"
            newLabel={(t) => `new topic: “${t}”`}
            options={props.pool.map((s) => ({
              value: s.title,
              hint: s.speakers.length
                ? s.speakers.join(", ")
                : "needs a speaker",
            }))}
          />
        </div>

        <button type="submit" class="ui-btn ui-btn-primary">add session</button>
      </div>

      <div class="mt-3 flex flex-wrap items-end gap-3">
        {/* Only ask for a speaker when the topic hasn't got one. */}
        {alreadyStaffed
          ? (
            <p class="ui-hint flex-1 basis-full">
              {chosen!.speakers.join(" and ")}{" "}
              already on this one — no need to pick anyone.
            </p>
          )
          : (
            <div class="min-w-[18rem] flex-1">
              <label class="ui-label" for="speaker">
                Speaker{" "}
                <span class="ui-label-hint">
                  {isNewTopic
                    ? "(new topic — who's presenting it?)"
                    : "(optional)"}
                </span>
              </label>
              <Combobox
                id="speaker"
                name="speaker"
                value={speaker}
                placeholder="pick someone, or type a new name"
                newLabel={(t) => `new person: “${t}”`}
                options={props.people.map((name) => ({ value: name }))}
              />
            </div>
          )}

        <div class="min-w-[14rem] flex-1">
          <label class="ui-label" for="notes">
            Notes <span class="ui-label-hint">(optional)</span>
          </label>
          <input
            id="notes"
            name="notes"
            placeholder="room, theme, catering…"
            class="ui-input"
          />
        </div>
      </div>
    </form>
  );
}

export default NewSession;
