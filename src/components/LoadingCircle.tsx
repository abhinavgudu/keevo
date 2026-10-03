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
        className="absolute -inset-[3px] rounded-full border-[3px] border-cyan-500/10"
      />
      <div
        aria-hidden="true"
        className="spinner-ring absolute -inset-[3px] rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(34,211,238,0) 0deg, rgba(103,232,249,0.95) 70deg, rgba(129,140,248,0.95) 170deg, rgba(34,211,238,0) 300deg, rgba(34,211,238,0) 360deg)',
          WebkitMask:
            'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))',
        }}
      />
      <KeevaMark className="w-full h-full" alt="" />
    </div>
  );
}