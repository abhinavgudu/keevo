/**
 * Single source of truth for "is the app installed".
 *
 * The install popup and the notification nudge both need this, and they need
 * the same answer: the nudge must wait for the install popup to go first, so
 * install-then-notify ordering lives here rather than in two copies that can
 * drift. `keeva_pwa_installed` is written by PwaInstallPrompt on `appinstalled`
 * and on native-install acceptance.
 */

export const LS_INSTALLED = 'keeva_pwa_installed';
/** iOS manual "I installed it" confirmation, honoured for a week, not forever. */
export const LS_MANUAL_UNTIL = 'keeva_pwa_confirmed_until';

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia.bind(window);
  return (
    mm('(display-mode: standalone)').matches ||
    mm('(display-mode: fullscreen)').matches ||
    mm('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandaloneMode()) return true;
  try {
    return window.localStorage.getItem(LS_INSTALLED) === 'true';
  } catch {
    return false;
  }
}
