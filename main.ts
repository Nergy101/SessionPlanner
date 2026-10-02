import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { isSignedIn, requiredPassword } from "./auth.ts";

// Refuse to boot without a password rather than serving an open app.
requiredPassword();

export const app = new App<State>();

app.use(staticFiles());

/** The dashboard is the only public view; everything else needs the cookie. */
const gate = define.middleware(async (ctx) => {
  const path = ctx.url.pathname;

  // Let visitors read the dashboard, but never mutate it. All planning views,
  // including standings, belong to the signed-in organiser.
  const reading = ctx.req.method === "GET" || ctx.req.method === "HEAD";
  if (path === "/" && reading) {
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
