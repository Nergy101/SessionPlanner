import { page } from "fresh";
import { define } from "@/utils.ts";
import { importData } from "@/services/backup.ts";

export const handler = define.handlers({
  GET(ctx) {
    return page({
      imported: ctx.url.searchParams.get("imported") === "1",
      error: ctx.url.searchParams.get("error"),
    });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
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
  return (
    <>
      <div class="mb-6">
        <h1 class="text-2xl">data</h1>
        <p class="mt-1 max-w-2xl text-slate-600 dark:text-slate-400">
          Download a complete backup or restore one from another SessionPlanner
          instance.
        </p>
      </div>

      {data.imported && (
        <p class="mb-6 rounded-md border border-dashed border-emerald-500/60 bg-emerald-50 px-3 py-2 font-mono text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
          backup imported successfully.
        </p>
      )}
      {data.error && (
        <p class="mb-6 rounded-md border border-dashed border-red-500/60 bg-red-50 px-3 py-2 font-mono text-sm text-red-800 dark:bg-red-950/30 dark:text-red-300">
          {data.error}
        </p>
      )}

      <div class="grid gap-6 md:grid-cols-2">
        <section class="ui-card">
          <h2>export</h2>
          <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Save subjects, sessions, people, links, tags and all planning
            history as one JSON backup.
          </p>
          <a
            href="/data/export"
            class="ui-btn ui-btn-primary mt-5 no-underline"
            download="sessionplanner-backup.json"
          >
            download backup
          </a>
        </section>

        <section class="ui-card">
          <h2>import</h2>
          <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Importing replaces all current data. Export this instance first if
            you may need to undo the restore.
          </p>
          <form
            method="post"
            action="/data"
            enctype="multipart/form-data"
            class="mt-5"
          >
            <label class="block">
              <span class="ui-label">backup JSON</span>
              <input
                type="file"
                name="backup"
                accept="application/json,.json"
                required
                class="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:font-mono file:text-sm file:font-semibold file:text-white hover:file:brightness-110 dark:text-slate-400"
              />
            </label>
            <button type="submit" class="ui-btn ui-btn-primary mt-4">
              replace data
            </button>
          </form>
        </section>
      </div>
    </>
  );
});
