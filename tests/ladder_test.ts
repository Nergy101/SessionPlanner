import { assertEquals } from "@std/assert";
import { deriveStatus } from "@/services/subjects.ts";

/**
 * deriveStatus is the whole ladder in one pure function, so it's worth pinning
 * down exhaustively before any database is involved.
 */

Deno.test("no speaker and no date is an idea", () => {
  assertEquals(deriveStatus("idea", false, false), "idea");
});

Deno.test("a speaker with no date is assigned", () => {
  assertEquals(deriveStatus("idea", true, false), "assigned");
});

Deno.test("losing the last speaker demotes back to idea", () => {
  assertEquals(deriveStatus("assigned", false, false), "idea");
});

Deno.test("a date makes it planned, with or without a speaker", () => {
  assertEquals(deriveStatus("idea", false, true), "planned");
  assertEquals(deriveStatus("assigned", true, true), "planned");
});

Deno.test("unscheduling falls back to assigned when a speaker remains", () => {
  assertEquals(deriveStatus("planned", true, false), "assigned");
});

Deno.test("unscheduling falls back to idea when nobody is on it", () => {
  assertEquals(deriveStatus("planned", false, false), "idea");
});

Deno.test("presented is sticky through every people and date change", () => {
  for (const people of [true, false]) {
    for (const session of [true, false]) {
      assertEquals(deriveStatus("presented", people, session), "presented");
    }
  }
});

Deno.test("archived is sticky through every people and date change", () => {
  for (const people of [true, false]) {
    for (const session of [true, false]) {
      assertEquals(deriveStatus("archived", people, session), "archived");
    }
  }
});
