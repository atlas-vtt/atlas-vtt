import { MAX_ABILITY_NAME, type GmMessage, type SharedRoll } from '../protocol/index.ts';
import { rollForPlayers, type RollSceneLookup } from '../../services/playerRollSource';
import type { DiceRollOrigin } from '../../types/diceRollOrigin';
import type { DiceRollResult } from '../../types/diceTypes';
import type { DiceSource } from './atlasDice.ts';
import type { LoggedRoll } from './log/TableLog.ts';

/** What a roll carries into the log beside its result: a flavor, the token it is said by, the roll button it answers. */
export type RollNotes = Pick<LoggedRoll, 'flavor' | 'speaker' | 'request'>;

export interface RollSharePorts {
  send(body: GmMessage, to?: string): void;
  /** Whether players see the GM's rolls made without a roll mode: the player view's "show dice rolls" setting. */
  showGmRolls(): boolean;
  /** Which token of the shared scene the players see a roll's origin as, as the local player window asks. */
  scene(): RollSceneLookup | null;
  /** The id players know a token of the shared scene by. */
  alias(tokenId: string): string;
  /** Takes the roll into the table's log, with the token Atlas rolled it for (`source`), which only the GM's log names. */
  logged?(roll: Omit<LoggedRoll, 'face'>, source: DiceRollResult['source']): void;
}

/** A roll as it travels: Atlas's result without who rolled it (`player`) and with the source players may know. */
export function sharedRoll(result: DiceRollResult): SharedRoll {
  const { id, timestamp, formula, modifiers, total, crit, source } = result;
  return {
    id, timestamp, formula, modifiers, total,
    rolls: result.rolls.map(({ die, value, max, min, negative, exploded, rerolled, dropped, success, failure, label, name, colour }) => ({
      die, value, max,
      ...(min === -1 && { min }),
      ...(negative && { negative }), ...(exploded && { exploded }), ...(rerolled && { rerolled }), ...(dropped && { dropped }),
      ...(success && { success }), ...(failure && { failure }), ...(label !== undefined && { label }), ...(name !== undefined && { name }), ...(colour !== undefined && { colour }),
    })),
    ...(crit !== undefined && { crit }),
    ...(result.linear === false && { linear: false as const }),
    ...(result.namedModifiers !== undefined && result.namedModifiers.length > 0 && { namedModifiers: result.namedModifiers.map(({ label, value }) => ({ label, value })) }),
    ...(source !== undefined && { source: source.abilityName === undefined ? { type: source.type } : { type: source.type, abilityName: source.abilityName.slice(0, MAX_ABILITY_NAME) } }),
  };
}

/**
 * Every roll of the shared tab, as its bus announces it, to the players: players' rolls always, the
 * GM's public rolls from the log always, the GM's other rolls only while the player view shows dice
 * rolls. Each is prepared as the local player window prepares it (`rollForPlayers`): it names its
 * token only when the players see that token, and only by the id they know it by; who rolled it is a
 * relay id or `'gm'`.
 */
export class RollShare {
  private readonly ports: RollSharePorts;
  private dice: DiceSource | null = null;
  /** The roll being made, while one is: whose it is, what it carries and whether it was made public by choice. */
  private making: { readonly who: string; readonly notes: RollNotes; readonly chosenPublic: boolean } | null = null;

  constructor(ports: RollSharePorts) {
    this.ports = ports;
  }

  /** Listens to the tab's rolls. */
  start(dice: DiceSource | null): void {
    this.stop();
    this.dice = dice;
    dice?.on('dice-rolled', this.rolled);
  }

  stop(): void {
    this.dice?.off('dice-rolled', this.rolled);
    this.dice = null;
  }

  /**
   * Runs `run`, during which a roll announced is `who`'s and carries `notes` into the log. A roll
   * `chosenPublic` (the GM picked Public roll for it) reaches the players whatever the player view's
   * setting, which decides only the GM's rolls made without a mode.
   */
  rollAs(who: string, run: () => void, notes: RollNotes = {}, chosenPublic = false): void {
    const previous = this.making;
    this.making = { who, notes, chosenPublic };
    try {
      run();
    } finally {
      this.making = previous;
    }
  }

  private readonly rolled = (result: DiceRollResult, origin?: DiceRollOrigin): void => {
    const { who, notes, chosenPublic } = this.making ?? { who: 'gm', notes: {}, chosenPublic: false };
    // A GM's roll the players are not shown is in the GM's own log only.
    if (who === 'gm' && !chosenPublic && !this.ports.showGmRolls()) return void this.ports.logged?.({ who, roll: sharedRoll(result), token: null, shared: false, ...notes }, result.source);
    const dice = this.dice;
    const scene = this.ports.scene();
    // Only an origin in this tab can name a token the shared scene shows.
    const local = origin !== undefined && origin.viewId === dice?.viewId ? origin : undefined;
    const prepared = rollForPlayers(result, local, scene, { showNames: false, imageSrc: () => null });
    const token = prepared.sourcePresentation && local !== undefined ? this.ports.alias(local.tokenId) : null;
    const roll = sharedRoll(prepared.result);
    this.ports.send({ t: 'roll', who, result: roll, token });
    this.ports.logged?.({ who, roll, token, shared: true, ...notes }, result.source);
  };
}
