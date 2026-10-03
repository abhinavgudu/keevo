'use client';

import QRCode from 'react-qr-code';

/**
 * A scannable code for a link.
 *
 * Rendered as SVG rather than a raster image: it stays sharp on any display
 * density, costs nothing to download, and needs no network request to a QR
 * service. A third-party QR endpoint would also mean handing every shared URL
 * to somebody else's server, which for a private profile link is not a trade
 * worth making.
 *
 * A real scannable code needs both a light and a dark module, so the modules are
 * near-black on white regardless of the app's dark theme. A dark-on-dark code
 * scans on almost no phone cameras, and it fails silently — the user sees a
 * plausible-looking block that nobody can read.
 */
export function LinkQrCode({
  value,
  size = 168,
  className = '',
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-2xl bg-white p-3 ${className}`}
      // Labeled for a screen reader: the code itself is not readable as text,
      // so the link it represents is offered as the accessible name.
      role="img"
      aria-label={`QR code linking to ${value}`}
    >
      <QRCode
        value={value}
        size={size}
        // Near-black rather than pure black: pure black on pure white is the
        // harshest possible contrast for a camera and costs accuracy at the
        // edges of each module.
        bgColor="#FFFFFF"
        fgColor="#0B1220"
        level="M"
      />
    </div>
  );
}