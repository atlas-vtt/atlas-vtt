import type { EventEmitter } from 'events';
import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { AtlasUIContext, type AtlasUIContextValue } from '../../root/AtlasUIContext';
import type { DiceRollOrigin } from '../../../types/diceRollOrigin';
import type { DiceRollResult } from '../../../types/diceTypes';
import type { PreparedDiceRoll } from './diceSourcePresentation';
import { DiceRollDisplay } from './DiceRollDisplay';

interface PlayerDiceToastsProps {
  app: App;
  eventBus: EventEmitter;
  container: HTMLElement;
  /** Decides, when a roll arrives, what of its source players see. */
  prepare: (result: DiceRollResult, origin: DiceRollOrigin | undefined) => PreparedDiceRoll;
}

/**
 * The DM's dice rolls as players see them in the player window. Who a roll
 * names, with what portrait, is fixed by `prepare` when it arrives; nothing
 * here looks a token or a statblock up.
 */
export function PlayerDiceToasts({ app, container, eventBus, prepare }: PlayerDiceToastsProps): React.ReactElement {
  const context = useMemo((): AtlasUIContextValue => ({ app, view: null, pixiApp: null, renderer: null }), [app]);

  return (
    <AtlasUIContext.Provider value={context}>
      {/* The DM's window plays the sound; a second one here would echo it. */}
      <DiceRollDisplay eventBus={eventBus} container={container} prepare={prepare} muted />
    </AtlasUIContext.Provider>
  );
}
