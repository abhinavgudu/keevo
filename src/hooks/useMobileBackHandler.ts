'use client';

/**
 * useMobileBackHandler
 *
 * Manages browser back button behavior for mobile:
 * - Intercepts back button press to close modals / clear filters in order
 * - When there's nothing left to close, shows an exit confirmation popup
 *
 * Strategy: We push a "sentinel" state onto history whenever something
 * opens. When the user presses Back, the popstate fires and we handle it
 * instead of the browser navigating away.
 */

import { useEffect, useCallback, useRef } from 'react';

export interface BackHandlerState {
  /** Is any modal currently open? */
  hasOpenModal: boolean;
  /** Are any filters active? */
  hasActiveFilters: boolean;
  /** Callback to close the top-most modal */
  closeModal: () => void;
  /** Callback to reset all filters */
  resetFilters: () => void;
  /** Callback to show exit confirmation */
  onExitRequest: () => void;
}

export function useMobileBackHandler({
  hasOpenModal,
  hasActiveFilters,
  closeModal,
  resetFilters,
  onExitRequest,
}: BackHandlerState) {
  const sentinelPushed = useRef(false);

  // Push a sentinel history entry so we can catch the back press
  const pushSentinel = useCallback(() => {
    if (!sentinelPushed.current) {
      window.history.pushState({ keevaSentinel: true }, '');
      sentinelPushed.current = true;
    }
  }, []);

  const popSentinel = useCallback(() => {
    sentinelPushed.current = false;
  }, []);

  // Whenever something opens, push sentinel
  useEffect(() => {
    if (hasOpenModal || hasActiveFilters) {
      pushSentinel();
    }
  }, [hasOpenModal, hasActiveFilters, pushSentinel]);

  // Handle popstate (back button press)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // If sentinel was hit
      if (sentinelPushed.current) {
        popSentinel();
        // Priority: close modal first
        if (hasOpenModal) {
          closeModal();
          // Re-push sentinel if filters still active
          if (hasActiveFilters) {
            requestAnimationFrame(() => pushSentinel());
          }
          return;
        }
        // Then clear filters
        if (hasActiveFilters) {
          resetFilters();
          return;
        }
      }

      // Nothing left to intercept → ask to exit
      // Prevent actual navigation by re-pushing sentinel
      window.history.pushState({ keevaSentinel: true }, '');
      sentinelPushed.current = true;
      onExitRequest();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasOpenModal, hasActiveFilters, closeModal, resetFilters, onExitRequest, pushSentinel, popSentinel]);
}
