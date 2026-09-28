import { KeevaMark } from '@/components/KeevaMark';

/**
 * The Keeva loading spinner: the brand mark inside the circle, with a rounded
 * border rotating around the logo's circumference.
 *
 * The rotating ring sits just outside the mark (negative inset equals the ring
 * thickness), so the bright arc visibly travels around the logo edge instead of
 * being hidden under it. `<img>` alt text is suppressed because a proper
 * spinner is announced through `role="status"` when a label is given; inline
 * button spinners pass no label and stay out of the accessibility tree's way.
 */
export function LoadingCircle({
  className = 'w-10 h-10',
  label,
}: {
  /** Tailwind sizing for the whole spinner, e.g. "w-8 h-8". */
  className?: string;
  /** Screen-reader text; omitted for tiny inline spinners. */
  label?: string;
}) {
  return (
    <div
      className={`relative shrink-0 ${className}`}
      {...(label ? { role: 'status', 'aria-label': label } : {})}
    >
      <div
        aria-hidden="true"
        className="absolute -inset-[3px] rounded-full border-[3px] border-cyan-500/15 border-t-cyan-300 border-r-cyan-500/40 animate-spin"
      />
      <KeevaMark className="w-full h-full" alt="" />
    </div>
  );
}