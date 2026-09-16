import { define } from "@/utils.ts";
import { searchPeople } from "@/services/people.ts";

/** Typeahead source for the speaker picker. */
export const handler = define.handlers({
  async GET(ctx) {
    const term = ctx.url.searchParams.get("q") ?? "";
    const people = await searchPeople(term);
    return Response.json(people.map((p) => p.name));
  },
});
