import { page } from "fresh";
import { define } from "@/utils.ts";
import { checkPassword, safeReturnTo, signInHeaders } from "@/auth.ts";

export const handler = define.handlers({
  GET(ctx) {
    return page({ failed: ctx.url.searchParams.get("error") !== null });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const password = String(form.get("password") ?? "");
    const returnTo = safeReturnTo(String(form.get("returnTo") ?? ""));

    if (!checkPassword(password)) {
      const q = returnTo === "/"
        ? ""
        : `&returnTo=${encodeURIComponent(returnTo)}`;
      return new Response(null, {
        status: 303,
        headers: { Location: `/login?error=1${q}` },
      });
    }

    const headers = await signInHeaders(ctx.url.protocol === "https:");
    headers.set("Location", returnTo);
    return new Response(null, { status: 303, headers });
  },
});

export default define.page<typeof handler>(function Login({ data, url }) {
  return (
    <div class="grid min-h-screen place-items-center p-4">
      <div class="ui-panel w-full max-w-sm">
        <p class="ui-eyebrow">session-planner</p>
        <h1 class="mb-6 mt-1 text-2xl">sign in</h1>

        {data.failed && (
          <div
            role="alert"
            class="mb-4 rounded-md border border-dashed border-rose-500 bg-rose-50 px-2.5 py-2 font-mono text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
          >
            that password isn't right.
          </div>
        )}

        <form method="post">
          <input
            type="hidden"
            name="returnTo"
            value={url.searchParams.get("returnTo") ?? "/"}
          />
          <label class="ui-label" for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autofocus
            autocomplete="current-password"
            class="ui-input"
          />
          <button type="submit" class="ui-btn ui-btn-primary mt-5 w-full">
            sign in
          </button>
        </form>
      </div>
    </div>
  );
});
