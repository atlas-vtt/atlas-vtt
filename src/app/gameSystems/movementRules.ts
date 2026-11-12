/** A collection's movement rules: reading them from the settings. */

import { NO_MOVEMENT_RULES, parseMovementRules, type MovementRules } from '../measure/movementRules';
import type { SystemPreset } from '../types/systemPresetTypes';

/**
 * The collection's movement rules: its own, else those of the preset it was set from, else none.
 * A collection stores rules of its own only once the GM edits them, so a corrected built-in
 * system reaches it; rules of its own without steps move without any, whatever the preset says.
 */
export function collectionMovementRules(
  settings: { movement?: unknown; systemPresetId?: string | undefined },
  presets: readonly SystemPreset[],
): MovementRules {
  return parseMovementRules(settings.movement)
    ?? presets.find((preset) => preset.id === settings.systemPresetId)?.rules.movement
    ?? NO_MOVEMENT_RULES;
}
