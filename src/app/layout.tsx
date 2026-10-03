import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { PushPermissionNudge } from '@/components/PushPermissionNudge';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { OfflineBanner, OfflineSync } from '@/components/OfflineStatus';

export const metadata: Metadata = {
  title: 'Keeva — Personal Media Intelligence Vault',
  description: 'Your ultra-smart personal content vault — save, organize, and auto-prioritize Instagram Reels, YouTube Videos, LinkedIn Posts, Articles, and PDF Documents.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Keeva',
  },
  // Icons come from the app-dir file conventions (favicon.ico, icon.svg,
  // apple-icon.png). Declaring `icons` here would override all three and
  // silently downgrade the favicon back to whatever single file it named.
  openGraph: {
    title: 'Keeva — Personal Media Intelligence Vault',
    description: 'Your ultra-smart personal content vault — save, organize, and auto-prioritize Instagram Reels, YouTube Videos, LinkedIn Posts, Articles, and PDF Documents.',
    siteName: 'Keeva',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Keeva — Personal Media Intelligence Vault',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Keeva — Personal Media Intelligence Vault',
    description: 'Your ultra-smart personal content vault — save, organize, and auto-prioritize Instagram Reels, YouTube Videos, LinkedIn Posts, Articles, and PDF Documents.',
    images: ['/og-image.jpg'],
  },
};

export const viewport: Viewport = {
  themeColor: '#06070B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icons/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#06070B] text-slate-100 antialiased selection:bg-cyan-500 selection:text-slate-950 font-sans">
        <AuthProvider>
          {children}
          <PushPermissionNudge />
          {/* Mounted here, not per page: an update can land on any screen, and a
              prompt that only existed on the dashboard would never be seen by
              someone who opened a deep link straight into a conversation. */}
          <PwaUpdatePrompt />
          {/* Offline support is a root concern, not a page one: the banner has
              to be visible on whatever screen the user happens to be on, and
              queued edits have to flush no matter where they navigated to. */}
          <OfflineSync />
          <OfflineBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
