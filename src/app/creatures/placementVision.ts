import { hasVisionDefaults } from '../gameSystems/visionDefaults';
import type { TokenVision, TokenVisionDefaults } from '../types/lightingTypes';

/**
 * The vision a token placed from the library starts with: the collection's default (`defaults`),
 * switched on only for a player character (`playerCharacter`, whose token sees by default), off
 * otherwise. A token's own senses win over its statblock's for good, so a token that links a
 * statblock (`linked`) gets none of the default's senses: it follows its statblock, whatever that
 * says today or after a later edit. Its sight range and cone are stamped all the same. Nothing of
 * the statblock is ever stamped.
 */
export function placementVision(defaults: TokenVisionDefaults | undefined, linked: boolean, playerCharacter = false): TokenVision | undefined {
  const enabled = playerCharacter;
  if (!defaults) return enabled ? { enabled } : undefined;
  if (!linked) return { enabled, ...structuredClone(defaults) };
  const { senses: _senses, darkvision: _darkvision, tremorsense: _tremorsense, ...rest } = defaults;
  return hasVisionDefaults(rest) || enabled ? { enabled, ...rest } : undefined;
}
