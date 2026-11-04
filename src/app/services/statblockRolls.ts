/**
 * Where a statblock's roll is made and shown. A map open in Atlas rolls it
 * with its own dice tool, so the roll lands in that map's dice log and on its
 * tokens, and is thrown on the map. Where that map is not on screen (another
 * tab), or no map is open at all, the surface the statblock is drawn on may
 * show the roll itself (`OffMapRolls`: the statblock beside its note).
 */

import type { App } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlasViewType';
import type { DiceRollResult } from '../types/diceTypes';
import type { DiceRollOrigin, TokenRollContext } from '../types/diceRollOrigin';
import { rollOrigin } from '../tools/diceRollOrigins';
import type { AdvantageSide, RollingDice } from '../types/diceSetTypes';
import { templateDiceSet } from '../statblocks/resolve/templateDiceSet';
import type { RollOptions } from '../tools/DiceTool';
import { ArmedBonuses, type ArmedBonus } from '../statblocks/rollBonuses/armedBonuses';
import type { ArmableValues } from '../statblocks/rollBonuses/armableValues';
import { armedValues, namedBareBonus, withArmedBonuses } from '../statblocks/rollBonuses/bonusFormula';
import { completeFormula } from '../tools/completeFormula';
import { parseFormula } from '../tools/parseFormula';

export interface DiceRollSource {
  /** The view that owns this statblock; used for routing, never saved on the roll. */
  viewId?: string | undefined;
  /**
   * The view, scene and tokens the statblock was opened for. A roll for one of those
   * tokens carries its origin with its event; never saved on the roll.
   */
  originContext?: TokenRollContext | undefined;
  tokenId?: string | undefined;
  statblockPath?: string | undefined;
  tokenName?: string | undefined;
  tokenImagePath?: string | undefined;
  abilityName?: string | undefined;
  /** The statblock whose armed values ("Add to next roll") the roll takes. Unset: none, as for rolled hit points. */
  bonuses?: StatblockBonuses | undefined;
  /** The value whose own number is rolled (`bonusId`): armed, it is not added again, and is spent with the others. */
  rolledBonus?: string | undefined;
  /** What the statblock's roll links roll, to the same rolls naming the `@` references they were filled in from (`SheetState.namedRolls`). */
  namedRolls?: ReadonlyMap<string, string> | undefined;
}

/** A statblock's armed values as a roll reads them: its key, and the values its card shows now, by id. */
export interface StatblockBonuses {
  key: string;
  armable: ArmableValues;
}

/** Shows a statblock's rolls where no map on screen shows them, and rolls them while no map is open. */
export interface OffMapRolls {
  /**
   * Rolls by the collection's dice, or by `options.set` (the statblock's template's) where one is
   * given, with advantage where `options` asks, telling no map: none is open. Null for a formula it refuses.
   */
  roll(formula: string, source: NonNullable<DiceRollResult['source']>, options?: RollOptions): DiceRollResult | null;
  /** Shows a roll; `muted` when an open map made it and plays its sounds. */
  show(result: DiceRollResult, muted: boolean): void;
  /** The dice a roll is made with, by `set` where one is given, else the collection's: what advantage can do. */
  rollingDice?(set?: RollOptions['set']): RollingDice;
  /**
   * Whether the surface lies over the map whose view is `mapEl`, hiding that map's own display of
   * its rolls, so a roll made there is shown here as well (the encounter builder, unless it is drawn
   * inside that map's view, where the map's display stands above it). Unset: never.
   */
  covers?(mapEl: HTMLElement): boolean;
}

interface DiceToolLike {
  rollDice(formula: string, source?: DiceRollResult['source'], origin?: DiceRollOrigin, options?: RollOptions): DiceRollResult | null;
  rollingDice?(set?: RollOptions['set']): RollingDice;
}

interface MapDice {
  tool: DiceToolLike;
  /** Whether the map's view is on screen, where its rolls are seen. */
  onScreen: boolean;
  viewId: string | undefined;
  /** The map view's element, where its rolls are shown. */
  containerEl: HTMLElement | undefined;
}

interface MapViewLike {
  viewId?: string;
  containerEl?: HTMLElement & { isShown?: () => boolean };
  serviceManager?: { getToolController?: () => { getDiceTool?: () => DiceToolLike } };
}

/** The dice tool of an open map view (only `viewId`'s where one is named), one on screen first; null while none is open. */
function mapDice(app: App, viewId: string | undefined): MapDice | null {
  let hidden: MapDice | null = null;
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const view = leaf.view as unknown as MapViewLike;
    if (viewId && view?.viewId !== viewId) continue;
    const tool = view?.serviceManager?.getToolController?.()?.getDiceTool?.();
    if (!tool) continue;
    const element = view.containerEl;
    // An element without Obsidian's `isShown` (a bare test double) counts as shown.
    const onScreen = typeof element?.isShown === 'function' ? element.isShown() : true;
    const found = { tool, onScreen, viewId: view.viewId, containerEl: element };
    if (onScreen) return found;
    hidden ??= found;
  }
  return hidden;
}

function rollSourceOf(source: DiceRollSource): NonNullable<DiceRollResult['source']> {
  const rollSource: NonNullable<DiceRollResult['source']> = { type: 'statblock' };
  if (source.tokenId) rollSource.tokenId = source.tokenId;
  if (source.statblockPath) rollSource.statblockPath = source.statblockPath;
  if (source.tokenName) rollSource.tokenName = source.tokenName;
  if (source.tokenImagePath) rollSource.tokenImagePath = source.tokenImagePath;
  if (source.abilityName) rollSource.abilityName = source.abilityName;
  return rollSource;
}

/**
 * The dice a statblock's roll is made with (its template's set, else the
 * collection's of the map that would roll it, else of the surface it is drawn
 * on), as rolling reads them; null where nothing could roll it or the roller
 * cannot say.
 */
export function statblockRollingDice(app: App, source: DiceRollSource, offMap?: OffMapRolls | null): RollingDice | null {
  const set = templateDiceSet(app, source.statblockPath);
  const map = mapDice(app, source.originContext?.viewId ?? source.viewId);
  if (map) return map.tool.rollingDice?.(set) ?? null;
  return offMap?.rollingDice?.(set) ?? null;
}

/**
 * The formula a statblock's roll throws: `formula` with the values armed for it after it, naming the
 * `@` references it was filled in from where its card knows them (`namedRolls`), else a bare bonus by
 * what the roll is for (`abilityName`: `+4` rolled for Agility throws `+4[Agility]`). Where the names
 * would take it past what the dice roll (a limit, once a bonus is completed with the game's dice), it
 * is thrown plain, as it would be without them.
 */
function thrownFormula(app: App, formula: string, armed: readonly ArmedBonus[], source: DiceRollSource, offMap: OffMapRolls | null | undefined): string {
  const plain = withArmedBonuses(formula, armed);
  const named = source.namedRolls?.get(formula) ?? namedBareBonus(formula, source.abilityName);
  if (named === null) return plain;
  const withNames = withArmedBonuses(named, armed);
  const rules = statblockRollingDice(app, source, offMap);
  return (rules ? completeFormula(withNames, rules) : parseFormula(withNames)).ok ? withNames : plain;
}

/**
 * Rolls a statblock's dice, tagged with its source: through the dice tool of the
 * map it was opened in (else of an open map), shown on `offMap` too while that map
 * is not on screen; without a map, by `offMap` alone. A roll for one of the tokens
 * it was opened for carries that token's origin. A bare bonus rolls with the dice
 * set of the statblock's template, else the collection's; `advantage` rolls with
 * that side of the set's rule. The values armed for the statblock (`bonuses`) are
 * added as labelled terms, as its card shows them now, and disarmed once the roll is made,
 * and the references the roll was filled in from are named (`thrownFormula`). Null when nothing could roll it.
 */
export function rollStatblockDice(
  app: App, formula: string, source: DiceRollSource, offMap?: OffMapRolls | null, advantage?: AdvantageSide | null,
): DiceRollResult | null {
  if (!source.bonuses) return rollWithSource(app, thrownFormula(app, formula, [], source, offMap), source, offMap, advantage);
  const { key, armable } = source.bonuses;
  const store = ArmedBonuses.forApp(app);
  const ids = store.armed(key);
  const armed = armedValues(ids.filter((id) => id !== source.rolledBonus), armable);
  const result = rollWithSource(app, thrownFormula(app, formula, armed, source, offMap), source, offMap, advantage);
  // Disarmed once the roll is out; a roll refused (a limit, no dice to roll it) leaves them armed.
  if (result) store.spend(key, [...armed.map((bonus) => bonus.id), ...(source.rolledBonus === undefined ? [] : [source.rolledBonus])]);
  return result;
}

function rollWithSource(
  app: App, formula: string, source: DiceRollSource, offMap: OffMapRolls | null | undefined, advantage: AdvantageSide | null | undefined,
): DiceRollResult | null {
  const rollSource = rollSourceOf(source);
  const set = templateDiceSet(app, source.statblockPath);
  const options: RollOptions | undefined = set || advantage ? { ...(set && { set }), ...(advantage && { advantage }) } : undefined;
  const context = source.originContext;
  const map = mapDice(app, context?.viewId ?? source.viewId);
  if (map) {
    // Proof of a token comes only from the context it was opened with, in the view it names.
    const sameView = context !== undefined && map.viewId === context.viewId && (!source.viewId || source.viewId === context.viewId);
    const origin = sameView ? rollOrigin(context, source.tokenId) : undefined;
    const result = options ? map.tool.rollDice(formula, rollSource, origin, options)
      : origin ? map.tool.rollDice(formula, rollSource, origin) : map.tool.rollDice(formula, rollSource);
    const covered = map.containerEl !== undefined && offMap?.covers?.(map.containerEl) === true;
    if (result && (!map.onScreen || covered)) offMap?.show(result, true);
    return result;
  }
  if (!offMap) return null;
  const result = options ? offMap.roll(formula, rollSource, options) : offMap.roll(formula, rollSource);
  if (result) offMap.show(result, false);
  return result;
}
