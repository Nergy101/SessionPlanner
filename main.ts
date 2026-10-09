import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { isSignedIn, requiredPassword } from "./auth.ts";

// Refuse to boot without a password rather than serving an open app.
requiredPassword();

export const app = new App<State>();

app.use(staticFiles());

/**
 * What visitors without the password may do, by path: read the dashboard
 * (never change it), claim an idea that has no speaker yet (claimSubject only
 * fills empty slots), and sign in or out. Every planning view belongs to the
 * signed-in organiser.
 */
const PUBLIC_METHODS = new Map<string, readonly string[]>([
  ["/", ["GET", "HEAD"]],
  ["/claim", ["POST"]],
  ["/login", ["GET", "HEAD", "POST"]],
  ["/logout", ["GET", "HEAD", "POST"]],
]);

function isPublic(path: string, method: string): boolean {
  return PUBLIC_METHODS.get(path)?.includes(method) ?? false;
}

/** Sends a visitor to the login page, back to `path` afterwards. */
function toLogin(path: string): Response {
  const returnTo = path === "/" ? "" : `?returnTo=${encodeURIComponent(path)}`;
  return new Response(null, {
    status: 303,
    headers: { Location: `/login${returnTo}` },
  });
}

const gate = define.middleware(async (ctx) => {
  const path = ctx.url.pathname;
  ctx.state.signedIn = await isSignedIn(ctx.req);
  if (!ctx.state.signedIn && !isPublic(path, ctx.req.method)) {
    return toLogin(path);
  }
  return ctx.next();
});

app.use(gate);
app.fsRoutes();
