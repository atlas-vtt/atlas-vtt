import type { App } from 'obsidian';
import { useCallback, useEffect, useState } from 'react';
import { AssetService } from '../../../services/AssetService';
import { useMapCollectionId } from '../../hooks/useMapCollectionId';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { runInBackground } from '../../../utils/backgroundTask';
import { t } from '../../../i18n';
import { readDiceShelf, type DiceShelf, type ShelfChange } from './diceShelf';

export interface DiceShelfAccess {
  shelf: DiceShelf;
  /** Writes a change to the collection's settings; null for a map outside every collection, which keeps none. */
  change: ((change: ShelfChange) => void) | null;
}

/** The saved rolls and the tray's row of a collection; empty for a map outside every collection. */
export function collectionDiceShelf(app: App, collectionId: string | null): DiceShelf {
  return readDiceShelf(collectionId ? AssetService.getInstance(app).getCollectionSettings(collectionId) : null);
}

/** The saved rolls and the tray's row of the view's collection, following edits to its settings from anywhere. */
export function useDiceShelf(): DiceShelfAccess {
  const { app } = useAtlasUI();
  const collectionId = useMapCollectionId();
  const read = useCallback(
    (): DiceShelf => collectionDiceShelf(app, collectionId),
    [app, collectionId],
  );
  const [shelf, setShelf] = useState(read);

  useEffect(() => {
    // A save that changed something else keeps the shelf the same object.
    const update = (): void => {
      const next = read();
      setShelf((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    update();
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (changedId) => {
      if (changedId === collectionId) update();
    });
    return () => app.workspace.offref(ref);
  }, [app, collectionId, read]);

  const change = useCallback((next: ShelfChange): void => {
    if (!collectionId) return;
    runInBackground(AssetService.getInstance(app).updateCollectionSettings(collectionId, next), 'Saving the dice tray\'s saved rolls', t('diceRoll.presetsSaveFailed'));
  }, [app, collectionId]);

  return { shelf, change: collectionId ? change : null };
}
