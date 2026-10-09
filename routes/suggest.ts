import { define } from "@/utils.ts";
import { suggestSubject } from "@/services/subjects.ts";

/**
 * The dashboard's capture bar, open to everyone (see the gate in main.ts):
 * add an idea, optionally with its speaker. The speaker field wins over the
 * older `Title @Name` shorthand.
 */
export const handler = define.handlers({
  async POST(ctx) {
    // Anyone can post here, so a missing or malformed body is just a refusal.
    const form = await ctx.req.formData().catch(() => new FormData());
    const { title, speaker } = readSuggestion(form);
    const id = await suggestSubject(title, speaker);
    if (id === null) return ctx.redirect("/", 303);
    return ctx.redirect(`/?added=${encodeURIComponent(title.trim())}`, 303);
  },
});

function readSuggestion(form: FormData) {
  const typed = field(form, "speaker").trim();
  const { title, speaker } = splitAtSpeaker(field(form, "title"));
  return { title, speaker: typed || speaker };
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "");

/**
 * `Testcontainers in CI @Jan de Vries`: everything before the first `@` is the
 * title, everything after it is the speaker's name (so it may contain spaces).
 */
function splitAtSpeaker(raw: string) {
  const at = raw.indexOf("@");
  if (at === -1) return { title: raw, speaker: "" };
  return { title: raw.slice(0, at), speaker: raw.slice(at + 1) };
}
