import { db } from "@/db/db.ts";
import type { Person } from "@/db/schema.ts";

/** Trim and collapse internal whitespace, so "  Jan   de Vries " is one name. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function listPeople(): Promise<Person[]> {
  return db.selectFrom("people").selectAll().orderBy("name").execute();
}

export function searchPeople(term: string, limit = 8): Promise<Person[]> {
  const t = normalizeName(term);
  let q = db.selectFrom("people").selectAll();
  if (t) q = q.where("name", "like", `%${t}%`);
  return q.orderBy("name").limit(limit).execute();
}

/**
 * Resolve a typed name to a person, creating one if it's new, and say which happened.
 *
 * The name column carries a NOCASE unique index, so this can never produce a casing
 * duplicate. Callers that want to tell the user "added" vs "already there" need the
 * `created` flag — guessing from timestamps would be a lie waiting to happen.
 */
export async function addPerson(
  name: string,
): Promise<{ person: Person; created: boolean }> {
  const norm = normalizeName(name);
  if (!norm) throw new Error("Name is empty.");

  const existing = await db
    .selectFrom("people")
    .selectAll()
    .where("name", "=", norm)
    .executeTakeFirst();
  if (existing) return { person: existing, created: false };

  const person = await db
    .insertInto("people")
    .values({ name: norm })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { person, created: true };
}

/** As above, when you don't care whether it already existed. */
export async function getOrCreatePerson(name: string): Promise<Person> {
  return (await addPerson(name)).person;
}

export async function renamePerson(id: number, newName: string): Promise<void> {
  const norm = normalizeName(newName);
  if (!norm) return;
  await db.updateTable("people").set({ name: norm }).where("id", "=", id)
    .execute();
}

/**
 * Fold `sourceId` into `targetId`. Subjects move across without duplicating where
 * both people were already on the same subject.
 */
export async function mergePeople(
  sourceId: number,
  targetId: number,
): Promise<void> {
  if (sourceId === targetId) return;

  await db.transaction().execute(async (trx) => {
    const sourceSubjects = await trx
      .selectFrom("subject_people")
      .select("subject_id")
      .where("person_id", "=", sourceId)
      .execute();

    const targetSubjects = await trx
      .selectFrom("subject_people")
      .select("subject_id")
      .where("person_id", "=", targetId)
      .execute();

    const alreadyOn = new Set(targetSubjects.map((r) => r.subject_id));
    const toMove = sourceSubjects
      .map((r) => r.subject_id)
      .filter((id) => !alreadyOn.has(id));

    if (toMove.length) {
      await trx
        .insertInto("subject_people")
        .values(
          toMove.map((subject_id) => ({ subject_id, person_id: targetId })),
        )
        .execute();
    }

    // The subject_people rows go with it via ON DELETE CASCADE.
    await trx.deleteFrom("people").where("id", "=", sourceId).execute();
  });
}

/** Only removes someone who is on no subjects; otherwise use a merge. */
export async function deletePerson(id: number): Promise<void> {
  const onSubjects = await db
    .selectFrom("subject_people")
    .select("subject_id")
    .where("person_id", "=", id)
    .executeTakeFirst();
  if (onSubjects) return;

  await db.deleteFrom("people").where("id", "=", id).execute();
}
