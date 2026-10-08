import { sql } from "@kysely/kysely";
import { db } from "@/db/db.ts";
import type { Note } from "@/db/schema.ts";

/** Newest first by creation. Editing a note doesn't move it. */
export function listNotes(): Promise<Note[]> {
  return db.selectFrom("notes").selectAll().orderBy("created_at", "desc")
    .orderBy("id", "desc").execute();
}

/**
 * Stores the body as typed, keeping line breaks; only the ends are trimmed and CRLF
 * becomes LF. A blank body is never stored, and null is returned instead.
 */
export async function addNote(body: string): Promise<Note | null> {
  const text = body.replace(/\r\n?/g, "\n").trim();
  if (!text) return null;
  return await db.insertInto("notes").values({ body: text }).returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * A blank body leaves the note unchanged. Clearing a note does not delete it;
 * deleting is a separate, explicit action, so a stray empty save can't lose text.
 */
export async function updateNote(id: number, body: string): Promise<void> {
  const text = body.replace(/\r\n?/g, "\n").trim();
  if (!text) return;
  await db.updateTable("notes")
    .set({ body: text, updated_at: sql`current_timestamp` })
    .where("id", "=", id)
    .execute();
}

export async function deleteNote(id: number): Promise<void> {
  await db.deleteFrom("notes").where("id", "=", id).execute();
}
