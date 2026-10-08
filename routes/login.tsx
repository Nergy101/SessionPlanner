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
      <div class="relative w-full max-w-[400px]">
        {/* The orange sticker: a careful, private space. */}
        <span class="absolute -top-3 right-4 z-10 rotate-3 border-2 border-line bg-careful px-2 py-0.5 font-bold text-[0.7rem] tracking-widest text-[#111]">
          PRIVATE
        </span>

        <div class="ui-panel shadow-[6px_6px_0_var(--color-line)] p-7">
          <p class="ui-eyebrow">session planner</p>
          <h1 class="mb-6 mt-1 text-3xl tracking-tight">Password, please</h1>

          {data.failed && (
            <div
              role="alert"
              class="mb-4 border-2 border-dashed border-careful bg-surface-2 px-3 py-2 text-sm font-bold text-danger-text"
            >
              That password isn't right.
            </div>
          )}

          <form method="post" class="flex flex-col gap-4" data-busy>
            <input
              type="hidden"
              name="returnTo"
              value={url.searchParams.get("returnTo") ?? "/"}
            />
            <div>
              <label class="ui-label" for="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autofocus
                autocomplete="current-password"
                class="ui-input min-h-12 text-base"
              />
            </div>
            <button type="submit" class="ui-btn ui-btn-primary w-full">
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
        </div>
      </div>
    </div>
  );
});
