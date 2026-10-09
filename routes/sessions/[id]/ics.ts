import { HttpError } from "fresh";
import { define } from "@/utils.ts";
import { getSession } from "@/services/sessions.ts";
import { icsFilename, sessionIcs } from "@/services/calendar.ts";

/** The session as a calendar file, to drop into Outlook or Google Calendar. */
export const handler = define.handlers({
  async GET(ctx) {
    const session = await getSession(Number(ctx.params.id));
    if (!session) throw new HttpError(404);

    const pageUrl = new URL(`/sessions/${session.id}`, ctx.url).href;
    return new Response(sessionIcs(session, pageUrl), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${icsFilename(session)}"`,
      },
    });
  },
});
