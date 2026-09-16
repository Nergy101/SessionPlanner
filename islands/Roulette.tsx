import { useSignal } from "@preact/signals";
import { useRef } from "preact/hooks";

interface Candidate {
  personId: number;
  name: string;
  lastPresented: string | null;
  monthsSince: number | null;
}

/**
 * Spin over the people who are overdue a talk.
 *
 * The suspense is the whole point, so it cycles names on a decelerating timer rather
 * than just picking one. The pick is uniform over the pool — no weighting by how
 * overdue someone is, because a wheel that always lands on the same person stops
 * being a game and becomes an accusation.
 */
export function Roulette({ candidates }: { candidates: Candidate[] }) {
  const showing = useSignal<string | null>(null);
  const winner = useSignal<Candidate | null>(null);
  const spinning = useSignal(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  if (candidates.length === 0) {
    return (
      <div class="ui-empty">
        Everybody has presented in the last six months. Genuinely impressive.
      </div>
    );
  }

  function spin() {
    if (spinning.value) return;
    spinning.value = true;
    winner.value = null;

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    // Tuned so the whole spin lands in roughly two seconds: long enough to build
    // suspense in a room, short enough that nobody is waiting on it.
    let delay = 40;
    let ticks = 0;
    const total = 14 + Math.floor(Math.random() * 5);

    const step = () => {
      // Cycle a random name, so it reads as a wheel rather than a fade-in.
      showing.value =
        candidates[Math.floor(Math.random() * candidates.length)].name;
      ticks += 1;

      if (ticks >= total) {
        showing.value = picked.name;
        winner.value = picked;
        spinning.value = false;
        return;
      }

      delay *= 1.15; // decelerate
      timer.current = setTimeout(step, delay);
    };

    step();
  }

  const overdue = (c: Candidate) =>
    c.lastPresented === null
      ? "never presented"
      : `${c.monthsSince} months ago`;

  return (
    <div class="ui-panel">
      <div class="flex flex-col items-center gap-4 py-4">
        <div
          class="flex h-20 w-full max-w-md items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800"
          aria-live="polite"
        >
          <span
            class={`font-mono text-2xl font-bold ${
              winner.value ? "text-brand" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {showing.value ?? "who's next?"}
          </span>
        </div>

        <button
          type="button"
          class="ui-btn ui-btn-primary"
          disabled={spinning.value}
          onClick={spin}
        >
          {spinning.value ? "spinning…" : winner.value ? "spin again" : "spin"}
        </button>

        {winner.value && !spinning.value && (
          <p class="ui-hint">
            {winner.value.name} — {overdue(winner.value)}. No pressure.
          </p>
        )}
      </div>

      <details class="mt-2 border-t border-dashed border-slate-200 pt-3 dark:border-slate-700/70">
        <summary class="ui-hint cursor-pointer">
          {candidates.length} in the pool
        </summary>
        <ul class="mt-2 flex flex-wrap gap-1">
          {candidates.map((c) => (
            <li key={c.personId} class="ui-chip">
              {c.name}
              <span class="opacity-60">· {overdue(c)}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default Roulette;
