import { define } from "@/utils.ts";
import { claimSubject } from "@/services/subjects.ts";

/**
 * The one write open to signed-out visitors (see the gate in main.ts): put
 * your own name on an idea that has no speaker yet.
 */
export const handler = define.handlers({
  async POST(ctx) {
    // Anyone can post here, so a missing or malformed body is just a refusal.
    const form = await ctx.req.formData().catch(() => new FormData());
    const name = String(form.get("name") ?? "");
    const claimed = await claimSubject(Number(form.get("subject")), name);
    const result = claimed
      ? `speaker=${encodeURIComponent(name.trim())}`
      : "unclaimed=1";
    return ctx.redirect(`/?${result}`, 303);
  },
});
