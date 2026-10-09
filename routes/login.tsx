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
  const returnTo = safeReturnTo(url.searchParams.get("returnTo") ?? "");

  return (
    <div class="login-page">
      <header class="login-top">
        <a href="/" class="sp-logo" aria-label="session planner – dashboard">
          <span class="sp-mark" style="--s:26px" aria-hidden="true">
            <span class="sp-sq"></span>
            <span class="sp-ci"></span>
          </span>
          <span class="sp-word">session planner</span>
        </a>
        <a href="/" class="font-display text-sm font-bold">
          ← Public dashboard
        </a>
      </header>

      <main class="login-card relative">
        <span class="sticker sticker-corner">PRIVATE</span>
        <h1>Password, please</h1>
        <p class="mt-2 text-muted">
          Everything except the dashboard is behind one shared password. You'll
          go back to <span class="font-mono text-text">{returnTo}</span>{" "}
          afterwards.
        </p>

        {data.failed && (
          <p role="alert" class="ui-alert mt-4">
            That password isn't right.
          </p>
        )}

        <form
          method="post"
          class="mt-5 flex flex-col gap-3"
          data-busy
          data-require="password"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <label class="ui-label" for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autofocus
            autocomplete="current-password"
            class="ui-input min-h-12 text-base"
          />
          <button type="submit" class="ui-btn ui-btn-primary min-h-12 w-full">
            Sign in ⏎
          </button>
          <span class="sp-busy" role="status">
            <span class="sp-mark" style="--s:18px" aria-hidden="true">
              <span class="sp-sq"></span>
              <span class="sp-ci"></span>
            </span>
            Signing in…
          </span>
        </form>
      </main>
    </div>
  );
});
