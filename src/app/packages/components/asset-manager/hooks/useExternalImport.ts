import { useEffect, useRef } from 'react';
import type { ExternalImport } from '../../../../services/collectionBundle/externalImport';
import type { CollectionTransferActions } from './useCollectionTransfer';

/**
 * Starts the review of a bundle handed to the asset manager from outside (an Armarium install) once the window is
 * open and no other export or import runs. A bundle the window closes on before its review has ended is cancelled.
 */
export function useExternalImport(
  pending: ExternalImport | undefined,
  isOpen: boolean,
  { transfer, startExternalImport }: Pick<CollectionTransferActions, 'transfer' | 'startExternalImport'>,
): void {
  const started = useRef<ExternalImport | null>(null);
  useEffect(() => {
    if (!pending || !isOpen || transfer || started.current === pending) return;
    if (startExternalImport(pending)) started.current = pending;
  }, [pending, isOpen, transfer, startExternalImport]);

  // Settling twice counts once, so a bundle whose review already ended is left as it ended.
  useEffect(() => (): void => pending?.onSettled({ kind: 'cancelled' }), [pending]);
}
