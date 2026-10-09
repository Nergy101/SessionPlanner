import { page } from "fresh";
import { define } from "@/utils.ts";
import { backupFilename, countRecords, importData } from "@/services/backup.ts";
import ImportFile from "@/islands/ImportFile.tsx";

/** What has to be typed before an import may replace everything. */
const CONFIRM_WORD = "replace";

export const handler = define.handlers({
  async GET(ctx) {
    return page({
      counts: await countRecords(),
      filename: backupFilename(),
      imported: ctx.url.searchParams.get("imported") === "1",
      error: ctx.url.searchParams.get("error"),
    });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    if (String(form.get("confirm") ?? "").trim() !== CONFIRM_WORD) {
      return ctx.redirect(
        `/data?error=${
          encodeURIComponent(`Type “${CONFIRM_WORD}” to confirm the import`)
        }`,
        303,
      );
    }

    const upload = form.get("backup");
    if (!(upload instanceof File) || upload.size === 0) {
      return ctx.redirect("/data?error=Choose+a+backup+file+first", 303);
    }

    try {
      await importData(JSON.parse(await upload.text()));
      return ctx.redirect("/data?imported=1", 303);
    } catch (error) {
      console.error("Backup import failed", error);
      return ctx.redirect(
        "/data?error=That+file+is+not+a+valid+SessionPlanner+backup",
        303,
      );
    }
  },
});

export default define.page<typeof handler>(function Data({ data }) {
  const { counts, filename, imported, error } = data;

  return (
    <>
      <header class="page-head">
        <h1>Data</h1>
        <p class="page-sub">
          Download a complete backup, or restore one from another instance.
        </p>
      </header>

      {imported && (
        <p role="status" class="ui-alert ui-alert-ok mb-5">
          Backup imported.
        </p>
      )}
      {error && <p role="alert" class="ui-alert mb-5">{error}</p>}

      <div class="grid items-start gap-5 md:grid-cols-2">
        <ExportCard counts={counts} filename={filename} />
        <ImportCard counts={counts} />
      </div>
    </>
  );
});

type Counts = Awaited<ReturnType<typeof countRecords>>;

function ExportCard({ counts, filename }: {
  counts: Counts;
  filename: string;
}) {
  return (
    <section class="ui-panel flex flex-col gap-4">
      <h2 class="text-xl">Export</h2>
      <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Object.entries(counts).map(([label, value]) => (
          <div key={label} class="count-tile">
            <span class="count-tile-value">{value}</span>
            <span class="ui-hint">{label}</span>
          </div>
        ))}
      </div>
      <p class="ui-hint">
        <span class="font-mono">{filename}</span> · includes notes
      </p>
      <a
        href="/data/export"
        class="ui-btn ui-btn-primary self-start"
        download={filename}
      >
        Download JSON
      </a>
    </section>
  );
}

/** Replace-everything import: the button stays off until the confirm word is typed. */
function ImportCard({ counts }: { counts: Counts }) {
  return (
    <section class="ui-panel ui-panel-careful">
      <span class="sticker sticker-corner">REPLACES EVERYTHING</span>
      <h2 class="text-xl">Import</h2>
      <p class="mt-2 text-muted">
        Importing deletes every subject, session, person and note here and puts
        the file's in their place. Export first if you might want to undo it.
      </p>
      <form
        method="post"
        action="/data"
        enctype="multipart/form-data"
        class="mt-4 flex flex-col gap-3"
        data-busy
        data-require="confirm"
        data-require-value={CONFIRM_WORD}
      >
        <ImportFile current={counts} />
        <label class="ui-label mt-1" for="confirm">
          Type <strong>{CONFIRM_WORD}</strong> to confirm
        </label>
        <input
          id="confirm"
          name="confirm"
          autocomplete="off"
          spellcheck={false}
          class="ui-input"
        />
        <button type="submit" class="ui-btn ui-btn-danger-solid self-start">
          Replace all data
        </button>
        <span class="sp-busy" role="status">
          <span class="sp-mark" style="--s:18px" aria-hidden="true">
            <span class="sp-sq"></span>
            <span class="sp-ci"></span>
          </span>
          Importing backup…
        </span>
      </form>
    </section>
  );
}
