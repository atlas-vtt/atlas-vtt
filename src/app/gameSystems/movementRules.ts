/** A collection's movement rules: reading them from the settings. */

import { toGameUnits, type StatedUnit } from '../grid/statedDistance';
import { NO_MOVEMENT_RULES, parseMovementRules, type MovementRules } from '../measure/movementRules';
import type { CollectionGridDefaults, GridUnitType } from '../types/collectionSettingsTypes';
import type { SystemPreset } from '../types/systemPresetTypes';

/** What a speed is written in: the unit and how many of it one square spans. */
type SpeedUnit = Pick<CollectionGridDefaults, 'unitType' | 'unitDistance'>;

/** The units that are real distances, which rulebooks convert into each other. */
const REAL_UNITS: Readonly<Partial<Record<GridUnitType, StatedUnit>>> = { feet: 'feet', yards: 'yards', meters: 'meters' };

/**
 * A preset's speed for creatures that state none, in what the collection measures in. A
 * collection that kept its system's unit reads the number as it stands, whatever its squares
 * span. One that changed the unit (a game in feet played in metres) reads it converted as
 * rulebooks convert distances, so 30 ft are 9 m; a system that counts in squares gives as many
 * of the collection's squares.
 */
function speedIn(speed: number, from: SpeedUnit, to: SpeedUnit | undefined): number {
  if (!to || to.unitType === from.unitType) return speed;
  const real = REAL_UNITS[from.unitType];
  const stated = real ? { value: speed, unit: real } : { value: speed / from.unitDistance, unit: 'squares' as const };
  const converted = toGameUnits(stated, { unitType: to.unitType, ruleDistance: to.unitDistance });
  return converted > 0 && Number.isFinite(converted) ? converted : speed;
}

/** A preset's movement rules as a collection that measures in `unit` reads them (`speedIn`). */
function presetMovement(preset: SystemPreset | undefined, unit: SpeedUnit | undefined): MovementRules | undefined {
  const movement = preset?.rules.movement;
  if (!preset || movement?.speed === undefined) return movement;
  const speed = speedIn(movement.speed, preset.rules.gridDefaults, unit);
  return speed === movement.speed ? movement : { ...movement, speed };
}

/**
 * The collection's movement rules: its own, else those of the preset it was set from, else none.
 * A collection stores rules of its own only once the GM edits them, so a corrected built-in
 * system reaches it; rules of its own without steps move without any, whatever the preset says.
 * With `gridDefaults`, the preset's speed is given in the collection's unit.
 */
export function collectionMovementRules(
  settings: { movement?: unknown; systemPresetId?: string | undefined; gridDefaults?: SpeedUnit | undefined },
  presets: readonly SystemPreset[],
): MovementRules {
  return parseMovementRules(settings.movement)
    ?? presetMovement(presets.find((preset) => preset.id === settings.systemPresetId), settings.gridDefaults)
    ?? NO_MOVEMENT_RULES;
}
