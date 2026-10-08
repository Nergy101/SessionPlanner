import { page } from "fresh";
import { define } from "@/utils.ts";
import { importData } from "@/services/backup.ts";
import ConfirmButton from "@/islands/ConfirmButton.tsx";

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
        <h1 class="text-3xl tracking-tight">data</h1>
        <p class="mt-1 max-w-2xl text-muted">
          Download a complete backup or restore one from another SessionPlanner
          instance.
        </p>
      </div>

      {data.imported && (
        <p
          role="status"
          class="mb-6 border-2 border-dashed border-ok-text bg-surface-2 px-3 py-2 font-bold text-ok-text"
        >
          Backup imported successfully.
        </p>
      )}
      {data.error && (
        <p
          role="alert"
          class="mb-6 border-2 border-dashed border-careful bg-surface-2 px-3 py-2 font-bold text-danger-text"
        >
          {data.error}
        </p>
      )}

      <div class="grid gap-6 md:grid-cols-2">
        <section class="ui-card">
          <h2>export</h2>
          <p class="mt-2 text-sm text-muted">
            Save subjects, sessions, people, links and all planning history as
            one JSON backup.
          </p>
          <a
            href="/data/export"
            class="ui-btn ui-btn-primary mt-5 no-underline"
            download="sessionplanner-backup.json"
          >
            download backup
          </a>
        </section>

        <section class="ui-card border-careful">
          <h2>import</h2>
          <p class="mt-2 text-sm text-muted">
            <strong class="text-danger-text">Replaces everything.</strong>{" "}
            Importing overwrites all current data. Export this instance first if
            you may need to undo the restore.
          </p>
          <form
            method="post"
            action="/data"
            enctype="multipart/form-data"
            class="mt-5 flex flex-col gap-4"
            data-busy
          >
            <label class="block">
              <span class="ui-label">backup JSON</span>
              <input
                type="file"
                name="backup"
                accept="application/json,.json"
                required
                class="mt-1 block w-full text-sm text-muted file:mr-3 file:border-2 file:border-line file:bg-surface file:px-3 file:py-2 file:font-bold file:text-text"
              />
            </label>
            <div>
              <ConfirmButton
                label="replace data"
                confirmLabel="yes, replace everything"
              />
            </div>
            <span class="sp-busy" role="status">
              <span class="sp-mark" style="--s:18px" aria-hidden="true">
                <span class="sp-sq"></span>
                <span class="sp-ci"></span>
              </span>
              Importing backup…
            </span>
          </form>
        </section>
      </div>
    </>
  );
});
