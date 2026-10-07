import { useMemo } from 'react';
import type { App } from 'obsidian';
import { diceColourSlot } from '../../../extensions/slots';
import { useSlot } from '../../../extensions/useSlot';
import { AssetService } from '../../../services/AssetService';
import { diceColoursFor } from '../../../tools/diceColourChoices';
import type { DieTag } from '../../../tools/diceTags';
import { useOptionalAtlasStore } from '../../ViewStoreContext';

const NONE: readonly DieTag[] = [];

/** The colours the dice tray of this view's map offers (`dice.registerColours`), asked again when providers change or are invalidated. */
export function useDiceColours(app: App | null, active: boolean): readonly DieTag[] {
  const mapPath = useOptionalAtlasStore((state) => state.mapPath, null);
  useSlot(diceColourSlot);
  const version = diceColourSlot.version();
  return useMemo(() => {
    if (!active || !app || !mapPath) return NONE;
    let collectionId: string | null = null;
    try {
      collectionId = AssetService.getInstance(app).getCollectionForMap(mapPath);
    } catch {
      return NONE;
    }
    return diceColoursFor(collectionId);
    // `version` asks the providers again after a registration or `ui.invalidate()`.
  }, [active, app, mapPath, version]);
}
