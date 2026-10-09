/** DiceBear's "waves" style; the image is served and cached by their CDN. */
const WAVES_URL = "https://api.dicebear.com/10.x/waves/svg";

/**
 * A person's generated picture: drifting waves in a squircle. Seeded by the
 * person's id rather than their name, so no names leave the app and a rename
 * keeps the picture. The animation runs inside the SVG and stops for anyone
 * who prefers reduced motion. Decorative: the name always sits next to it.
 */
export function WaveAvatar({ personId }: { personId: number }) {
  const params = new URLSearchParams({
    seed: `person-${personId}`,
    animationVariant: "slow",
  });
  return (
    <span class="wave-avatar" aria-hidden="true">
      <img
        src={`${WAVES_URL}?${params}`}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        referrerpolicy="no-referrer"
      />
    </span>
  );
}
