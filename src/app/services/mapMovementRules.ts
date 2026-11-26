import type { App } from 'obsidian';
import { collectionMovementRules } from '../gameSystems/movementRules';
import { NO_MOVEMENT_RULES, type MovementRules } from '../measure/movementRules';
import { systemPresetsOf } from './mapCollectionRules';
import { mapRules } from './mapRules';

/** Movement rules the map plays by (`mapRules`); none without any. Follow them with `onMapRulesChange`. */
export function mapMovementRules(app: App, mapPath: string | null | undefined): MovementRules {
  const { settings } = mapRules(app, mapPath);
  return settings ? collectionMovementRules(settings, systemPresetsOf(app)) : NO_MOVEMENT_RULES;
}
