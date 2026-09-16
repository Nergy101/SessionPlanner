import { createPortal } from "preact/compat";
import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { Stroopwafel } from "@/components/Stroopwafel.tsx";

/** How long the party lasts before it clears itself. */
const DURATION_MS = 5500;

interface Piece {
  id: number;
  size: number;
  delay: number;
  duration: number;
  /** Start, peak and end positions, in vw / vh. */
  path: [number, number, number, number, number, number];
  spin: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Small stroopwafels raining from the top and bursting in from both sides. */
function makePieces(): Piece[] {
  const pieces: Piece[] = [];
  let id = 0;

  for (let i = 0; i < 40; i++) {
    const x = rand(-2, 98);
    const drift = rand(-8, 8);
    pieces.push({
      id: id++,
      size: rand(1.4, 3.2),
      delay: rand(0, 2.4),
      duration: rand(2.6, 4.2),
      path: [x, -12, x + drift / 2, 40, x + drift, 112],
      spin: rand(-540, 540),
    });
  }

  for (const side of [-1, 1]) {
    for (let i = 0; i < 18; i++) {
      // Left side starts off-screen left and flies right; right side mirrors it.
      const from = side === -1 ? -8 : 104;
      const y = rand(45, 95);
      const reach = rand(18, 48);
      const peakX = side === -1 ? from + reach : from - reach;
      const endX = side === -1 ? peakX + rand(8, 25) : peakX - rand(8, 25);
      pieces.push({
        id: id++,
        size: rand(1.4, 3),
        delay: rand(0, 1.6),
        duration: rand(2.4, 3.6),
        path: [from, y, peakX, y - rand(30, 55), endX, 112],
        spin: side * rand(360, 900),
      });
    }
  }
  return pieces;
}

/**
 * The stroopwafel button in the header. One click floods the screen orange with a
 * giant stroopwafel and stroopwafel confetti; it clears after a few seconds, or on
 * a click or Escape.
 */
export function StroopwafelEgg() {
  const pieces = useSignal<Piece[] | null>(null);

  useEffect(() => {
    if (!pieces.value) return;
    const close = () => pieces.value = null;
    const timer = setTimeout(close, DURATION_MS);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [pieces.value]);

  return (
    <>
      <button
        type="button"
        data-no-straat
        class="ui-icon-btn"
        title="Stroopwafel tijd!"
        aria-label="Stroopwafel tijd!"
        onClick={() => pieces.value = makePieces()}
      >
        <Stroopwafel id="sw-icon" class="h-5 w-5" />
      </button>

      {
        /* Portalled to <body>: the header's backdrop-blur would otherwise become the
          containing block and trap this "fixed" overlay inside the header. */
      }
      {pieces.value && createPortal(
        <div
          data-no-straat
          role="dialog"
          aria-modal="true"
          aria-label="Stroopwafel tijd!"
          class="stroop-party fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center gap-6 overflow-hidden bg-orange-500 p-6"
          onClick={() => pieces.value = null}
          style={`--stroop-total: ${DURATION_MS}ms`}
        >
          <h2 class="stroop-title relative z-10 text-center font-mono text-5xl font-black tracking-tight text-white drop-shadow-[0_4px_0_rgba(124,45,18,0.55)] sm:text-7xl">
            Stroopwafel tijd!
          </h2>
          <div class="stroop-hero relative z-10 w-[min(62vw,52vh)]">
            <Stroopwafel id="sw-hero" class="h-auto w-full drop-shadow-2xl" />
          </div>

          <div
            class="pointer-events-none absolute inset-0 z-20"
            aria-hidden="true"
          >
            {pieces.value.map((p) => (
              <div
                key={p.id}
                class="stroop-piece"
                style={[
                  `--size: ${p.size}rem`,
                  `--x0: ${p.path[0]}vw`,
                  `--y0: ${p.path[1]}vh`,
                  `--x1: ${p.path[2]}vw`,
                  `--y1: ${p.path[3]}vh`,
                  `--x2: ${p.path[4]}vw`,
                  `--y2: ${p.path[5]}vh`,
                  `--spin: ${p.spin}deg`,
                  `animation-duration: ${p.duration}s`,
                  `animation-delay: ${p.delay}s`,
                ].join(";")}
              >
                <Stroopwafel id={`sw-${p.id}`} class="h-full w-full" />
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default StroopwafelEgg;
