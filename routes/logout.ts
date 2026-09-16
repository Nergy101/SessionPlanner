import { define } from "@/utils.ts";
import { signOutHeaders } from "@/auth.ts";

export const handler = define.handlers({
  POST() {
    const headers = signOutHeaders();
    headers.set("Location", "/login");
    return new Response(null, { status: 303, headers });
  },
});
