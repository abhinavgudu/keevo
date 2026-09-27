/**
 * The Keeva brand mark, cropped to a circle.
 *
 * keeva-logo.png is a square 1024x1024 image: a small centred diamond on a
 * near-black field (rgb(1,3,10)). It has no alpha channel, so its corners are
 * opaque, and every surface that shows it - the header, the footer and the
 * community page - is that same near-black. Clipping the square to a circle
 * therefore removes the corners invisibly instead of leaving a dark box, and
 * the gradient ring reads as the edge of a round badge.
 *
 * `object-cover` rather than `contain`: cover fills the badge so the mark is
 * not letterboxed by the image's dark padding, and because the source is
 * square a cover on a square badge crops nothing else.
 */
export function KeevaMark({
  className = 'w-10 h-10',
  alt = 'Keeva',
}: {
  /** Tailwind sizing for the outer badge, e.g. "w-11 h-11". */
  className?: string;
  alt?: string;
}) {
  return (
    <div
      className={`shrink-0 rounded-full bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-600 p-[1.5px] shadow-lg shadow-cyan-500/25 overflow-hidden ${className}`}
    >
      <div className="w-full h-full rounded-full overflow-hidden bg-[#06070B]">
        <img
          src="/keeva-logo.png"
          alt={alt}
          draggable={false}
          className="w-full h-full object-cover rounded-full filter drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]"
        />
      </div>
    </div>
  );
}
