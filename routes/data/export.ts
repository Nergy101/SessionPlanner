import { define } from "@/utils.ts";
import { exportData } from "@/services/backup.ts";

export const handler = define.handlers({
  async GET() {
    const backup = await exportData();
    return new Response(JSON.stringify(backup, null, 2) + "\n", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="sessionplanner-backup.json"',
        "Cache-Control": "no-store",
      },
    });
  },
});
