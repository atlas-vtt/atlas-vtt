import type { TokenEntity } from '../../types';
import type { DiceSet } from '../../types/diceSetTypes';
import type { RollOptions } from '../../tools/DiceTool';
import { gatedStatblocks } from './book/statblockGate.ts';
import type { WorkspaceLeaf } from 'obsidian';
import type { DiceRollOrigin } from '../../types/diceRollOrigin';
import type { DiceRollResult } from '../../types/diceTypes';
import type { DiceRules } from '../../types/diceRulesTypes';
import type { RollingDice } from '../../types/diceSetTypes';
import { call } from './atlasView.ts';

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

type Methods<K extends string> = { readonly [name in K]: (...args: unknown[]) => unknown };

const hasMethods = <K extends string>(value: unknown, ...names: K[]): value is Methods<K> =>
  typeof value === 'object' && value !== null && names.every((name) => name in value && typeof (value as Record<string, unknown>)[name] === 'function');

/**
 * The dice of an Atlas map tab (`view.serviceManager`'s tool controller and event bus, all public),
 * or null when the view has none of them (another Atlas version).
 */
export function diceSourceOf(leaf: WorkspaceLeaf): DiceSource | null {
  const view: unknown = leaf.view;
  const services = typeof view === 'object' && view !== null && 'serviceManager' in view ? view.serviceManager : undefined;
  const viewId = typeof view === 'object' && view !== null && 'viewId' in view ? view.viewId : undefined;
  const tool = call(call(services, 'getToolController'), 'getDiceTool');
  const bus = call(services, 'getEventBus');
  if (typeof viewId !== 'string' || !hasMethods(tool, 'rollDice', 'getDiceRules') || !hasMethods(bus, 'on', 'off')) return null;
  return {
    viewId,
    rollDice: (formula, source, origin, options) => tool.rollDice(formula, source, origin, options) as DiceRollResult | null,
    setFor: (token) => {
      const path = (token.kind === 'character' ? token.statblockPath : undefined)
        || gatedStatblocks.libraryStatblock(token);
      return gatedStatblocks.diceSet?.(path ?? undefined);
    },
    rules: () => tool.getDiceRules() as DiceRules | RollingDice,
    on: (event, listener) => bus.on(event, listener),
    off: (event, listener) => bus.off(event, listener),
  };
}
