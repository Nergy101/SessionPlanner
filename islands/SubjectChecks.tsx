import { useSignal } from "@preact/signals";
import type { SubjectChecks as Checks } from "@/services/subjects.ts";

/** The three judgement calls, in column order. */
const FLAGS = [
  { name: "bloggable", label: "Bloggable" },
  { name: "linkedinWorthy", label: "LinkedIn worthy" },
  { name: "sessionable", label: "Sessionable" },
] as const;

/**
 * A subject row's checkmarks and blog author. The form is `display: contents`,
 * so each control lands in its own column of the row's grid.
 *
 * Every change posts the whole form in the background; without JavaScript the
 * Save button does the same as a plain POST.
 */
export function SubjectChecks(props: {
  subjectId: number;
  title: string;
  checks: Checks;
  people: Array<{ id: number; name: string }>;
  action: string;
}) {
  const failed = useSignal(false);
  const { checks } = props;

  async function save(form: HTMLFormElement) {
    const res = await fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      redirect: "manual",
    }).catch(() => null);
    failed.value = !res || (res.type !== "opaqueredirect" && !res.ok);
  }

  return (
    <form
      method="post"
      action={props.action}
      class="subject-checks"
      onChange={(e) => save(e.currentTarget)}
    >
      <input type="hidden" name="intent" value="checks" />
      <input type="hidden" name="subject" value={props.subjectId} />
      {FLAGS.map((flag) => (
        <label key={flag.name} class="check-cell">
          <input
            type="checkbox"
            name={flag.name}
            checked={checks[flag.name]}
            aria-label={`${flag.label}: ${props.title}`}
          />
          <span class="check-name">{flag.label}</span>
        </label>
      ))}
      <span class="blog-cell">
        <label class="check-cell">
          <input
            type="checkbox"
            name="blogWritten"
            checked={checks.blogWritten}
            aria-label={`Blog written: ${props.title}`}
          />
          <span class="check-name">Blog written</span>
        </label>
        <select
          name="blogAuthor"
          aria-label={`Blog author: ${props.title}`}
          class="ui-select ui-select-sm blog-author"
        >
          <option value="" selected={checks.blogAuthorId === null}>—</option>
          {props.people.map((p) => (
            <option
              key={p.id}
              value={p.id}
              selected={p.id === checks.blogAuthorId}
            >
              {p.name}
            </option>
          ))}
        </select>
        {failed.value && (
          <span
            role="status"
            class="check-failed"
            title="Not saved — try again"
          >
            !
          </span>
        )}
        <noscript>
          <button type="submit" class="ui-btn ui-btn-sm">Save</button>
        </noscript>
      </span>
    </form>
  );
}

export default SubjectChecks;
