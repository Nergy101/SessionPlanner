import { useSignal } from "@preact/signals";

type Counts = Record<"subjects" | "sessions" | "people" | "notes", number>;

/**
 * The backup file picker plus a before/after summary: what is here now and
 * will be deleted, and — once a file is picked — what the file holds. Reading
 * the file happens in the browser; without JavaScript only the "will be
 * deleted" line shows and the server still validates the upload.
 */
export function ImportFile(props: { current: Counts }) {
  const inFile = useSignal<Counts | "invalid" | null>(null);

  async function preview(file: File | undefined) {
    inFile.value = file ? countBackup(await file.text()) : null;
  }

  return (
    <>
      <label class="ui-label" for="backup">Backup file</label>
      <input
        id="backup"
        type="file"
        name="backup"
        accept="application/json,.json"
        required
        class="ui-file"
        onChange={(e) => preview(e.currentTarget.files?.[0])}
      />
      <dl class="import-summary">
        {inFile.value && (
          <>
            <dt>In file</dt>
            <dd>
              {inFile.value === "invalid"
                ? "not a SessionPlanner backup"
                : describe(inFile.value)}
            </dd>
          </>
        )}
        <dt>Will be deleted</dt>
        <dd>{describe(props.current)}</dd>
      </dl>
    </>
  );
}

/** Table sizes from a backup's JSON, or "invalid" when it doesn't look like one. */
function countBackup(json: string): Counts | "invalid" {
  try {
    const tables = JSON.parse(json)?.tables;
    const size = (name: keyof Counts) => {
      if (!Array.isArray(tables?.[name])) throw new Error(name);
      return tables[name].length as number;
    };
    return {
      subjects: size("subjects"),
      sessions: size("sessions"),
      people: size("people"),
      notes: size("notes"),
    };
  } catch {
    return "invalid";
  }
}

function describe(counts: Counts): string {
  return Object.entries(counts).map(([table, n]) => `${n} ${table}`)
    .join(" · ");
}

export default ImportFile;
