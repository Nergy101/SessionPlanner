/** DiceBear's "waves" style; the image is served and cached by their CDN. */
const WAVES_URL = "https://api.dicebear.com/10.x/waves/svg";

/**
 * A person's generated picture: drifting waves in a squircle. Seeded by the
 * person's id rather than their name, so no names leave the app and a rename
 * keeps the picture. The animation runs inside the SVG and stops for anyone
 * who prefers reduced motion. Decorative: the name always sits next to it.
 */
/** The picture for one person, with the slow drift animation. */
function wavesUrl(personId: number): string {
  const params = new URLSearchParams({
    seed: `person-${personId}`,
    animationVariant: "slow",
  });
  return `${WAVES_URL}?${params}`;
}

export function WaveAvatar({ personId, size = 44 }: {
  personId: number;
  /** Outer size in px, outline included. */
  size?: number;
}) {
  return (
    <span class="wave-avatar" style={`--size:${size}px`} aria-hidden="true">
      <img
        src={wavesUrl(personId)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerpolicy="no-referrer"
      />
    </span>
  );
}
