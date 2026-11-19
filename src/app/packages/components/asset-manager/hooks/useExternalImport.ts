import { useEffect, useRef } from 'react';
import type { ExternalImport } from '../../../../services/collectionBundle/externalImport';
import type { CollectionTransferActions } from './useCollectionTransfer';

/**
 * Starts the review of a bundle handed to the asset manager from outside (an Armarium install) once the window is
 * open and no other export or import runs. A bundle whose review has not started when the window closes, or that the
 * window drops (unmounted, or handed a newer one), is cancelled.
 */
export function useExternalImport(
  pending: ExternalImport | undefined,
  isOpen: boolean,
  { transfer, startExternalImport }: Pick<CollectionTransferActions, 'transfer' | 'startExternalImport'>,
): void {
  /** The bundle last started or cancelled here: never started (again) after that. */
  const handled = useRef<ExternalImport | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!pending || !isOpen || transfer || handled.current === pending) return;
    if (startExternalImport(pending)) handled.current = pending;
  }, [pending, isOpen, transfer, startExternalImport]);

  // A window that stays mounted while closed (the map's) would otherwise hold the install waiting for good.
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current && pending && handled.current !== pending) {
      handled.current = pending;
      pending.onSettled({ kind: 'cancelled' });
    }
    wasOpen.current = false;
  }, [isOpen, pending]);

  // Settling twice counts once, so a bundle whose review already ended is left as it ended.
  useEffect(() => (): void => pending?.onSettled({ kind: 'cancelled' }), [pending]);
}
