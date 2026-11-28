import type { TokenEntity } from '../../types';
import type { DiceSet } from '../../types/diceSetTypes';
import type { RollOptions } from '../../tools/DiceTool';
import { gatedStatblocks } from './book/statblockGate.ts';
import type { DiceRollOrigin } from '../../types/diceRollOrigin';
import type { DiceRollResult } from '../../types/diceTypes';
import type { DiceRules } from '../../types/diceRulesTypes';
import type { RollingDice } from '../../types/diceSetTypes';
import type { MapView } from './mapView.ts';

/** What `dice-rolled` carries on an Atlas view's bus: the roll and, when known, the token it was made for. */
export type DiceRolledListener = (result: DiceRollResult, origin?: DiceRollOrigin) => void;

/**
 * The dice of an Atlas map tab: its dice tool, which rolls by the map's collection rules and shows the
 * roll on the GM's screen, and the view's bus, on which every roll of the view is announced.
 */
export interface DiceSource {
  readonly viewId: string;
  rollDice(formula: string, source?: DiceRollResult['source'], origin?: DiceRollOrigin, options?: RollOptions): DiceRollResult | null;
  /** The template's dice for an already-authorized character; absent means the campaign's. */
  setFor?(token: TokenEntity): DiceSet | undefined;
  /** The map's dice set, used where the character has no override. */
  rules(): DiceRules | RollingDice;
  on(event: 'dice-rolled', listener: DiceRolledListener): unknown;
  off(event: 'dice-rolled', listener: DiceRolledListener): unknown;
}

/** The dice of an Atlas map view: its tool controller's dice tool and its event bus; null where it has no tools. */
export function diceSourceOf(view: MapView): DiceSource | null {
  const tool = view.serviceManager.getToolController()?.getDiceTool();
  if (tool === undefined) return null;
  const bus = view.serviceManager.getEventBus();
  return {
    viewId: view.viewId,
    rollDice: (formula, source, origin, options) => tool.rollDice(formula, source, origin, options),
    setFor: (token) => {
      const path = (token.kind === 'character' ? token.statblockPath : undefined)
        || gatedStatblocks.libraryStatblock(token);
      return gatedStatblocks.diceSet?.(path ?? undefined);
    },
    rules: () => tool.getDiceRules(),
    on: (event, listener) => bus.on(event, listener),
    off: (event, listener) => bus.off(event, listener),
  };
}
