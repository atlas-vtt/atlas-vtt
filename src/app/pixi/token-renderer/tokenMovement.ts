/**
 * What the canvas knows of how a map's tokens move: the collection's movement rules and each
 * token's speed. A speed that comes from a statblock is read from the record `CreatureIndex`
 * holds, never from the note: a drag asks at every step, so an unread statblock gives no speed
 * (the drag then reads as a plain distance), and `prepare` asks for it ahead of the drag.
 */

import type { App } from 'obsidian';
import { CreatureIndex } from '../../creatures/CreatureIndex';
import { ownSpeed, speedChoices, statblockSpeeds, tokenSpeed, type SpeedToken, type StatedSpeed } from '../../creatures/statblockSpeeds';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { MovementRules } from '../../measure/movementRules';

export interface TokenMovement {
  /** The movement rules the map plays by now. */
  rules(): MovementRules;
  /** What the map measures in now: the unit speeds are read in and written with. */
  settings(): MeasurementSettings;
  /** How far the token moves in one move, in game units; null without a speed and while its statblock is unread. */
  speedOf(token: SpeedToken): number | null;
  /**
   * The speeds the token may pick from (`speedChoices` of its statblock), the default first. None
   * for a token that moves by a speed of its own, links no statblock, or whose statblock is unread.
   */
  choicesOf(token: SpeedToken): StatedSpeed[];
  /** Has the statblocks of `tokens` read, so their speeds are known by the time they are dragged. Nothing where the rules name no step. */
  prepare(tokens: Iterable<SpeedToken>): void;
}

/** The statblock a token's speed is read from: none for a token with a speed of its own. */
function speedStatblock(token: SpeedToken): string | null {
  return token.statblockPath && ownSpeed(token) === undefined ? token.statblockPath : null;
}

/**
 * The movement of a map that plays by `rules()` and measures in `settings()`, both asked for at
 * every step of a drag. The creature index is taken from the app only once a token's statblock
 * is asked for, so maps without linked tokens never start it.
 */
export function tokenMovement(app: App, rules: () => MovementRules, settings: () => MeasurementSettings): TokenMovement {
  const creatureOf = (token: SpeedToken): ReturnType<CreatureIndex['get']> => {
    const path = speedStatblock(token);
    return path === null ? null : CreatureIndex.forApp(app).get(path);
  };
  return {
    rules,
    settings,
    speedOf: (token) => tokenSpeed(token, creatureOf(token), settings()),
    choicesOf: (token) => {
      const creature = creatureOf(token);
      return creature ? speedChoices(statblockSpeeds(creature.fields, creature.meanings, settings())) : [];
    },
    prepare: (tokens) => {
      if (rules().steps.length === 0) return;
      const paths = [...tokens].flatMap((token) => speedStatblock(token) ?? []);
      if (paths.length > 0) CreatureIndex.forApp(app).request(paths);
    },
  };
}
