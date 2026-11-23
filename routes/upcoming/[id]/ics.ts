import { HttpError } from "fresh";
import { define } from "@/utils.ts";
import { getSession, isPast } from "@/services/sessions.ts";
import {
  icsFilename,
  publicAgendaText,
  sessionIcs,
} from "@/services/calendar.ts";
import { publicPageEnabled } from "@/services/public_page.ts";

/**
 * The public counterpart of /sessions/:id/ics (NER-332): the same calendar
 * file, but only what a stranger may see — the running order without the
 * organiser's session notes. 404s unless PUBLIC_PAGE is on and the session
 * is still ahead.
 */
export async function upcomingSessionIcs(
  id: string,
  pageUrl: string,
): Promise<Response> {
  if (!publicPageEnabled()) throw new HttpError(404);
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId)) throw new HttpError(404);
  const session = await getSession(sessionId);
  if (!session || isPast(session.date)) throw new HttpError(404);

  return new Response(sessionIcs(session, pageUrl, publicAgendaText(session)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename(session)}"`,
    },
  });
}

/** The session as a calendar file, linking back to the public page. */
export const handler = define.handlers({
  async GET(ctx) {
    return upcomingSessionIcs(
      ctx.params.id,
      new URL("/upcoming", ctx.url).href,
    );
  },
});
