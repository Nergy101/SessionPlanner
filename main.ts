import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { isSignedIn, requiredPassword } from "./auth.ts";

// Refuse to boot without a password rather than serving an open app.
requiredPassword();

export const app = new App<State>();

app.use(staticFiles());

/** Everything except /login and the assets needs the cookie. */
const gate = define.middleware(async (ctx) => {
  const path = ctx.url.pathname;

  // The scoreboard is the one public surface: gamification needs an audience, and
  // the rest of this app is a private organiser's tool. It is read-only.
  //
  // Still resolve the cookie before letting it through — otherwise a signed-in
  // organiser looks anonymous on this one page and the shell hides their own nav.
  if (path === "/standings") {
    ctx.state.signedIn = await isSignedIn(ctx.req);
    return ctx.next();
  }

  if (path === "/login" || path === "/logout") {
    ctx.state.signedIn = await isSignedIn(ctx.req);
    return ctx.next();
  }

  if (!await isSignedIn(ctx.req)) {
    const returnTo = path === "/"
      ? ""
      : `?returnTo=${encodeURIComponent(path)}`;
    return new Response(null, {
      status: 303,
      headers: { Location: `/login${returnTo}` },
    });
  }

  ctx.state.signedIn = true;
  return ctx.next();
});

app.use(gate);
app.fsRoutes();
