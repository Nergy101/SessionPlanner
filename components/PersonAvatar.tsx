/** DiceBear's "critters" style; the image is served and cached by their CDN. */
const AVATAR_URL = "https://api.dicebear.com/10.x/critters/svg";

/** The picture for one person, slowly animated. */
function avatarUrl(personId: number): string {
  const params = new URLSearchParams({
    seed: `person-${personId}`,
    animationVariant: "slow",
  });
  return `${AVATAR_URL}?${params}`;
}

/**
 * A person's generated picture: a little critter in a squircle. Seeded by the
 * person's id rather than their name, so no names leave the app and a rename
 * keeps the picture. The animation runs inside the SVG and stops for anyone
 * who prefers reduced motion. Decorative: the name always sits next to it.
 */
export function PersonAvatar({ personId, size = 44 }: {
  personId: number;
  /** Outer size in px, outline included. */
  size?: number;
}) {
  return (
    <span class="person-avatar" style={`--size:${size}px`} aria-hidden="true">
      <img
        src={avatarUrl(personId)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerpolicy="no-referrer"
      />
    </span>
  );
}
