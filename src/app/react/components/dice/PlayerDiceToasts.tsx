import type { EventEmitter } from 'events';
import React, { useCallback, useMemo } from 'react';
import type { App } from 'obsidian';
import { AtlasUIContext, type AtlasUIContextValue } from '../../root/AtlasUIContext';
import { ReadableViewStoreProvider, type ReadableViewStore } from '../../ViewStoreContext';
import type { DiceRollResult } from '../../../tools/DiceTool';
import { DiceRollDisplay } from './DiceRollDisplay';

interface PlayerDiceToastsProps {
  app: App;
  eventBus: EventEmitter;
  /** Store of the presented scene: which tokens players cannot see, and how the others look on the map. */
  store: ReadableViewStore;
  container: HTMLElement;
}

/**
 * The DM's dice rolls as players see them in the player window. A roll made
 * for a token hidden on the map keeps its ability and result but not the
 * token's name or portrait, so it does not give the token away. Every other
 * token's portrait is read from the presented scene, like in the DM's window:
 * its artwork and ring on the map, not the picture of its statblock.
 */
export function PlayerDiceToasts({ app, store, container, eventBus }: PlayerDiceToastsProps): React.ReactElement {
  const context = useMemo((): AtlasUIContextValue => ({ app, view: null, pixiApp: null, renderer: null }), [app]);

  const forPlayers = useCallback((result: DiceRollResult): DiceRollResult => {
    const source = result.source;
    const tokenId = source?.tokenId;
    if (!source || !tokenId || !store.getState().objects?.tokens?.[tokenId]?.isHidden) return result;
    const { type, abilityName } = source;
    return { ...result, source: abilityName ? { type, abilityName } : { type } };
  }, [store]);

  return (
    <AtlasUIContext.Provider value={context}>
      <ReadableViewStoreProvider store={store}>
        {/* The DM's window plays the sound; a second one here would echo it. */}
        <DiceRollDisplay eventBus={eventBus} container={container} prepare={forPlayers} muted />
      </ReadableViewStoreProvider>
    </AtlasUIContext.Provider>
  );
}
