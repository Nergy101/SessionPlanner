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

  // Two public surfaces, both read-only: the scoreboard, because gamification needs
  // an audience, and a look at the dashboard, so colleagues can see what's coming
  // up. Only GET — the dashboard's capture and schedule forms POST to "/", and
  // those stay behind the password. Everything else is the organiser's tool.
  //
  // Still resolve the cookie before letting it through — otherwise a signed-in
  // organiser looks anonymous on these pages and the shell hides their own nav.
  const reading = ctx.req.method === "GET" || ctx.req.method === "HEAD";
  if (path === "/standings" || (path === "/" && reading)) {
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
