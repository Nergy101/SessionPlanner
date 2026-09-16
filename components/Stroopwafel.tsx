/**
 * A stroopwafel, drawn: a golden disc with a pressed waffle grid and a caramel
 * seam around the edge. Sized by its container via `class`.
 */
export function Stroopwafel(
  { class: cls, id = "sw" }: { class?: string; id?: string },
) {
  const lines = [-36, -24, -12, 0, 12, 24, 36];
  return (
    <svg
      viewBox="0 0 100 100"
      class={cls}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <circle cx="50" cy="50" r="40" />
        </clipPath>
        <radialGradient id={`${id}-bake`} cx="42%" cy="38%" r="70%">
          <stop offset="0%" stop-color="#f2c27a" />
          <stop offset="70%" stop-color="#d9964a" />
          <stop offset="100%" stop-color="#b87330" />
        </radialGradient>
      </defs>
      {/* outer wafer edge */}
      <circle cx="50" cy="50" r="47" fill="#a8652a" />
      {/* caramel seam peeking out */}
      <circle cx="50" cy="50" r="44" fill="#7a3f12" />
      <circle cx="50" cy="50" r="42.5" fill="#c9802f" />
      <circle cx="50" cy="50" r="40" fill={`url(#${id}-bake)`} />
      {/* pressed diagonal grid */}
      <g
        clip-path={`url(#${id}-clip)`}
        stroke="#9a5620"
        stroke-width="2.6"
        stroke-linecap="round"
        opacity="0.75"
      >
        {lines.map((o) => (
          <line key={`a${o}`} x1={o} y1="0" x2={o + 100} y2="100" />
        ))}
        {lines.map((o) => (
          <line key={`b${o}`} x1={100 - o} y1="0" x2={-o} y2="100" />
        ))}
      </g>
      {/* a little shine */}
      <ellipse
        cx="37"
        cy="30"
        rx="12"
        ry="6"
        fill="#fff3d6"
        opacity="0.35"
        transform="rotate(-25 37 30)"
      />
    </svg>
  );
}
