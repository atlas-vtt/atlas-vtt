import { MAX_ABILITY_NAME, type GmMessage, type SharedRoll } from '../protocol/index.ts';
import { rollForPlayers, type ShownRollToken } from '../../services/playerRollSource';
import type { DiceRollOrigin } from '../../types/diceRollOrigin';
import type { DiceRollResult } from '../../types/diceTypes';
import type { DiceSource } from './atlasDice.ts';
import { unnamedRoll } from './log/logEntries.ts';
import type { LoggedRoll } from './log/TableLog.ts';

/** A token a roll names, as the players' picture shows it, and to whom: everyone (null), or the players whose own picture shows it. */
export interface NamedToken {
  readonly shown: ShownRollToken;
  readonly to: readonly string[] | null;
}

/** How a roll is prepared for players: no names or pictures of the GM's vault, which they are sent apart. */
const PLAYERS_VIEW = { showNames: false, imageSrc: (): null => null };

/** What a roll carries into the log beside its result: a flavor, the token it is said by, the roll button it answers. */
export type RollNotes = Pick<LoggedRoll, 'flavor' | 'speaker' | 'request'>;

export interface RollSharePorts {
  send(body: GmMessage, to?: string): void;
  /** Whether players see the GM's rolls made without a roll mode: the player view's "show dice rolls" setting. */
  showGmRolls(): boolean;
  /** The token of the shared scene a roll's origin names, as players see it and who does; null where none does. */
  named(origin: DiceRollOrigin): NamedToken | null;
  /** The players at the table now, who all hear every roll. */
  players(): readonly string[];
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
    ...(result.advantage !== undefined && { advantage: result.advantage }),
    ...(source !== undefined && { source: source.abilityName === undefined ? { type: source.type } : { type: source.type, abilityName: source.abilityName.slice(0, MAX_ABILITY_NAME) } }),
  };
}

/**
 * Every roll of the shared tab, as its bus announces it, to the players: players' rolls always, the
 * GM's public rolls from the log always, the GM's other rolls only while the player view shows dice
 * rolls. Each is prepared as the local player window prepares it (`rollForPlayers`): it names its
 * token only to the players whose picture shows that token (`unnamedRoll` for the others: once to all
 * where everyone is told alike), and only by the id they know it by; who rolled it is a relay id or `'gm'`.
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
    // Only an origin in this tab can name a token the shared scene shows.
    const local = origin !== undefined && origin.viewId === this.dice?.viewId ? origin : undefined;
    const named = local === undefined ? null : this.ports.named(local);
    const prepared = rollForPlayers(result, local, named && { shownToken: () => named.shown }, PLAYERS_VIEW);
    const token = prepared.sourcePresentation && local !== undefined ? this.ports.alias(local.tokenId) : null;
    const roll = sharedRoll(prepared.result);
    const players = this.ports.players();
    const seeing = token === null || named?.to == null ? players : players.filter((player) => named.to?.includes(player));
    const everyone = seeing.length === players.length;
    if (everyone || seeing.length === 0) {
      const told = everyone ? { roll, token } : { roll: unnamedRoll(roll), token: null };
      this.ports.send({ t: 'roll', who, result: told.roll, token: told.token });
      this.ports.logged?.({ who, ...told, shared: true, ...notes }, result.source);
      return;
    }
    for (const player of players) this.ports.send(seeing.includes(player) ? { t: 'roll', who, result: roll, token } : { t: 'roll', who, result: unnamedRoll(roll), token: null }, player);
    this.ports.logged?.({ who, roll, token, namedFor: seeing, shared: true, ...notes }, result.source);
  };
}
