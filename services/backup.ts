import type {
  Person,
  SessionRow,
  SubjectLink,
  SubjectRow,
} from "@/db/schema.ts";
import { db } from "@/db/db.ts";

export const BACKUP_VERSION = 1;

export interface BackupTables {
  people: Person[];
  sessions: SessionRow[];
  subjects: SubjectRow[];
  subject_links: SubjectLink[];
  subject_people: SubjectPerson[];
  subject_tags: SubjectTag[];
}

export interface Backup {
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  tables: BackupTables;
}

interface SubjectPerson {
  subject_id: number;
  person_id: number;
}

interface SubjectTag {
  subject_id: number;
  tag: string;
}

export async function exportData(): Promise<Backup> {
  const [
    people,
    sessions,
    subjects,
    subject_links,
    subject_people,
    subject_tags,
  ] = await Promise.all([
    db.selectFrom("people").selectAll().orderBy("id").execute(),
    db.selectFrom("sessions").selectAll().orderBy("id").execute(),
    db.selectFrom("subjects").selectAll().orderBy("id").execute(),
    db.selectFrom("subject_links").selectAll().orderBy("id").execute(),
    db.selectFrom("subject_people").selectAll().orderBy("subject_id").orderBy(
      "person_id",
    ).execute(),
    db.selectFrom("subject_tags").selectAll().orderBy("subject_id").orderBy(
      "tag",
    ).execute(),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      people,
      sessions,
      subjects,
      subject_links,
      subject_people,
      subject_tags,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function hasKeys(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return isRecord(value) && keys.every((key) => key in value);
}

function validateRows(backup: unknown): asserts backup is Backup {
  if (!isRecord(backup) || backup.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version; expected ${BACKUP_VERSION}`);
  }
  if (typeof backup.exportedAt !== "string" || !isRecord(backup.tables)) {
    throw new Error("Invalid backup metadata");
  }

  const tables = backup.tables;
  const arrays = [
    "people",
    "sessions",
    "subjects",
    "subject_links",
    "subject_people",
    "subject_tags",
  ];
  if (!arrays.every((name) => Array.isArray(tables[name]))) {
    throw new Error("Invalid backup tables");
  }

  for (const row of tables.people as unknown[]) {
    if (
      !hasKeys(row, ["id", "name", "created_at"]) ||
      !isInteger(row.id) || typeof row.name !== "string" ||
      typeof row.created_at !== "string"
    ) throw new Error("Invalid people row");
  }
  for (const row of tables.sessions as unknown[]) {
    if (
      !hasKeys(row, ["id", "date", "notes", "created_at"]) ||
      !isInteger(row.id) || typeof row.date !== "string" ||
      !isNullableString(row.notes) || typeof row.created_at !== "string"
    ) throw new Error("Invalid sessions row");
  }
  for (const row of tables.subjects as unknown[]) {
    if (
      !hasKeys(row, [
        "id",
        "title",
        "description",
        "status",
        "session_id",
        "slides_url",
        "recording_url",
        "recap_notes",
        "bounty",
        "created_at",
        "updated_at",
      ]) ||
      !isInteger(row.id) || typeof row.title !== "string" ||
      !isNullableString(row.description) || !isInteger(row.status) ||
      !(row.session_id === null || isInteger(row.session_id)) ||
      !isNullableString(row.slides_url) ||
      !isNullableString(row.recording_url) ||
      !isNullableString(row.recap_notes) || !isInteger(row.bounty) ||
      typeof row.created_at !== "string" || typeof row.updated_at !== "string"
    ) throw new Error("Invalid subjects row");
  }
  for (const row of tables.subject_links as unknown[]) {
    if (
      !hasKeys(row, ["id", "subject_id", "url", "label"]) ||
      !isInteger(row.id) || !isInteger(row.subject_id) ||
      typeof row.url !== "string" || !isNullableString(row.label)
    ) throw new Error("Invalid subject_links row");
  }
  for (const row of tables.subject_people as unknown[]) {
    if (
      !hasKeys(row, ["subject_id", "person_id"]) ||
      !isInteger(row.subject_id) || !isInteger(row.person_id)
    ) throw new Error("Invalid subject_people row");
  }
  for (const row of tables.subject_tags as unknown[]) {
    if (
      !hasKeys(row, ["subject_id", "tag"]) ||
      !isInteger(row.subject_id) || typeof row.tag !== "string"
    ) throw new Error("Invalid subject_tags row");
  }
}

export async function importData(value: unknown): Promise<void> {
  validateRows(value);
  const { tables } = value;

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("subject_people").execute();
    await trx.deleteFrom("subject_tags").execute();
    await trx.deleteFrom("subject_links").execute();
    await trx.deleteFrom("subjects").execute();
    await trx.deleteFrom("sessions").execute();
    await trx.deleteFrom("people").execute();

    if (tables.people.length) {
      await trx.insertInto("people").values(tables.people).execute();
    }
    if (tables.sessions.length) {
      await trx.insertInto("sessions").values(tables.sessions).execute();
    }
    if (tables.subjects.length) {
      await trx.insertInto("subjects").values(tables.subjects).execute();
    }
    if (tables.subject_links.length) {
      await trx.insertInto("subject_links").values(tables.subject_links)
        .execute();
    }
    if (tables.subject_people.length) {
      await trx.insertInto("subject_people").values(tables.subject_people)
        .execute();
    }
    if (tables.subject_tags.length) {
      await trx.insertInto("subject_tags").values(tables.subject_tags)
        .execute();
    }
  });
}
