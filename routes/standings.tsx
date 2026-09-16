import { page } from "fresh";
import { define } from "@/utils.ts";
import {
  leaderboard,
  monthsAgo,
  openBounties,
  radar,
  rouletteCandidates,
  seasonProgress,
  trophyHolder,
  XP,
} from "@/services/scoring.ts";
import { formatShortDate } from "@/services/sessions.ts";
import Roulette from "@/islands/Roulette.tsx";

/**
 * The public scoreboard.
 *
 * Deliberately unauthenticated (see the gate in main.ts): gamification needs an
 * audience, and the rest of the app is a private organiser's tool. Read-only —
 * nothing here can change anything.
 */
export const handler = define.handlers({
  async GET() {
    const [board, progress, trophy, areas, bounties, roulette] = await Promise
      .all([
        leaderboard(),
        seasonProgress(),
        trophyHolder(),
        radar(),
        openBounties(),
        rouletteCandidates(6),
      ]);

    return page({ board, progress, trophy, areas, bounties, roulette });
  },
});

function Medal({ rank }: { rank: number }) {
  const medal = ["🥇", "🥈", "🥉"][rank];
  return (
    <span class="inline-block w-6 text-center font-mono text-sm">
      {medal ?? <span class="text-slate-500">{rank + 1}</span>}
    </span>
  );
}

export default define.page<typeof handler>(function Standings({ data }) {
  const { board, progress, trophy, areas, bounties, roulette } = data;
  const pct = Math.min(100, Math.round((progress.xp / progress.target) * 100));
  const maxCovered = Math.max(1, ...areas.map((a) => a.presented));

  return (
    <>
      <div class="mb-8">
        <p class="ui-eyebrow">session planner</p>
        <h1 class="mt-1 text-3xl">standings</h1>
        <p class="mt-1 max-w-2xl text-slate-600 dark:text-slate-400">
          Who's been sharing, what we've covered, and what's still up for grabs.
        </p>
      </div>

      {/* ---- season progress ---- */}
      <section class="mb-9">
        <div class="ui-section-head">
          <h2>season {progress.season.label}</h2>
          <span class="ui-hint">
            {progress.talks} talk{progress.talks === 1 ? "" : "s"} ·{" "}
            {progress.speakers} speaker{progress.speakers === 1 ? "" : "s"}
          </span>
        </div>

        <div class="ui-panel">
          <div class="mb-2 flex items-end justify-between gap-4">
            <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
              {progress.xp} XP
            </span>
            <span class="ui-hint">target {progress.target}</span>
          </div>
          <div
            class="h-3 w-full overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800"
            role="progressbar"
            aria-valuenow={progress.xp}
            aria-valuemin={0}
            aria-valuemax={progress.target}
            aria-label={`Season progress: ${progress.xp} of ${progress.target} XP`}
          >
            <div
              class="h-full bg-brand transition-all"
              style={`width: ${pct}%`}
            />
          </div>
          <p class="ui-hint mt-2">
            Earned by speakers: claim a topic {XP.assigned} · get it booked{" "}
            {XP.planned} · present it {XP.presented}{" "}
            · add slides and a recording +{XP.archivist} · plus any bounty.
          </p>
          <p class="ui-hint mt-1">
            Running the board earns nothing — {progress.subjectsAdded}{" "}
            idea{progress.subjectsAdded === 1 ? "" : "s"}{" "}
            captured this season, which is admin, not a score.
          </p>
        </div>
      </section>

      {/* ---- trophy ---- */}
      <section class="mb-9">
        <div class="ui-section-head">
          <h2>the trophy</h2>
          <span class="ui-hint">champion of {trophy.season.label}</span>
        </div>

        {trophy.champion
          ? (
            <div class="ui-panel flex items-center gap-4">
              <span class="text-5xl" aria-hidden="true">🏆</span>
              <div>
                <p class="font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
                  {trophy.champion.name}
                </p>
                <p class="ui-hint">
                  {trophy.champion.talks}{" "}
                  talk{trophy.champion.talks === 1 ? "" : "s"} ·{" "}
                  {trophy.champion.xp} XP in {trophy.season.label}
                </p>
                <p class="mt-1 text-[0.78rem] text-slate-600 dark:text-slate-400">
                  Holds the trophy until {trophy.season.label} is beaten.
                </p>
              </div>
            </div>
          )
          : (
            <div class="ui-empty">
              No talks in {trophy.season.label}{" "}
              — the trophy is unclaimed. First one to present takes it.
            </div>
          )}
      </section>

      {/* ---- leaderboard ---- */}
      <section class="mb-9">
        <div class="ui-section-head">
          <h2>leaderboard</h2>
          <span class="ui-hint">
            rolling 12 months · since {formatShortDate(monthsAgo(12))}
          </span>
        </div>

        {board.length === 0
          ? <div class="ui-empty">Nothing scored yet. Present something.</div>
          : (
            <div class="ui-table-wrap overflow-x-auto">
              <table class="w-full border-collapse">
                <thead>
                  <tr>
                    <th class="ui-th w-12"></th>
                    <th class="ui-th">Speaker</th>
                    <th class="ui-th w-20">XP</th>
                    <th class="ui-th w-20">Talks</th>
                    <th class="ui-th w-24">Archived</th>
                    <th class="ui-th">Areas</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((s, i) => (
                    <tr
                      key={s.personId}
                      class={i < 3 ? "bg-amber-50/40 dark:bg-amber-500/5" : ""}
                    >
                      <td class="ui-td">
                        <Medal rank={i} />
                      </td>
                      <td class="ui-td font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {s.name}
                        {s.bounty > 0 && (
                          <span class="ui-badge ui-badge-assigned ml-2">
                            +{s.bounty} bounty
                          </span>
                        )}
                      </td>
                      <td class="ui-td font-mono text-sm font-bold text-brand">
                        {s.xp}
                      </td>
                      <td class="ui-td font-mono text-sm">{s.talks}</td>
                      <td class="ui-td font-mono text-sm">
                        {s.archived > 0
                          ? `📼 ${s.archived}`
                          : <span class="ui-hint">—</span>}
                      </td>
                      <td class="ui-td">
                        <div class="flex flex-wrap gap-1">
                          {s.areas.length
                            ? s.areas.map((a) => (
                              <span key={a} class="ui-chip">{a}</span>
                            ))
                            : <span class="ui-hint">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      {/* ---- tech radar ---- */}
      <section class="mb-9">
        <div class="ui-section-head">
          <h2>coverage</h2>
          <span class="ui-hint">dark cells are gaps — pick one</span>
        </div>

        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {areas.map((a) => {
            const heat = a.presented / maxCovered;
            const covered = a.presented > 0;
            return (
              <div
                key={a.area}
                class={`rounded-lg border border-dashed p-3 ${
                  covered
                    ? "border-emerald-400/60 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                    : "border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900"
                }`}
                style={covered ? `opacity: ${0.55 + heat * 0.45}` : ""}
              >
                <p class="font-mono text-[0.8rem] font-bold text-slate-900 dark:text-slate-100">
                  {a.area}
                </p>
                <p class="ui-hint mt-0.5">
                  {a.presented
                    ? `${a.presented} talk${a.presented === 1 ? "" : "s"}`
                    : "never covered"}
                  {a.upcoming > 0 && ` · ${a.upcoming} coming`}
                </p>
                {a.lastCovered && (
                  <p class="ui-hint">last {formatShortDate(a.lastCovered)}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- bounties ---- */}
      <section class="mb-9">
        <div class="ui-section-head">
          <h2>bounties</h2>
          <span class="ui-hint">unclaimed topics with XP on them</span>
        </div>

        {bounties.length === 0
          ? <div class="ui-empty">No bounties up right now.</div>
          : (
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bounties.map((s) => (
                <article key={s.id} class="ui-card">
                  <div class="flex items-start justify-between gap-2">
                    <span class="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {s.title}
                    </span>
                    <span class="ui-badge ui-badge-planned whitespace-nowrap">
                      {s.bounty} XP
                    </span>
                  </div>
                  {s.description && (
                    <p class="ui-hint line-clamp-3">{s.description}</p>
                  )}
                  <p class="mt-auto border-t border-dashed border-slate-200 pt-2 text-[0.78rem] text-slate-600 dark:border-slate-700/70 dark:text-slate-400">
                    Claim it and it's yours.
                  </p>
                </article>
              ))}
            </div>
          )}
      </section>

      {/* ---- roulette ---- */}
      <section>
        <div class="ui-section-head">
          <h2>roulette</h2>
          <span class="ui-hint">nobody who presented in the last 6 months</span>
        </div>
        <Roulette candidates={roulette} />
      </section>

      <p class="ui-hint mt-10 border-t border-dashed border-slate-300 pt-4 dark:border-slate-700">
        Scores are recomputed from the schedule every time this page loads —
        there is no stored total to argue with.
      </p>
    </>
  );
});
