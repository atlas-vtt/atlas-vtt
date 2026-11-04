import type { App } from 'obsidian';
import { DEFAULT_INITIATIVE_RULES, collectionInitiativeRules } from '../gameSystems/initiativeRules';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { systemPresetsOf } from './mapCollectionRules';
import { mapRules } from './mapRules';

/** Initiative rules the map plays by (`mapRules`); the default rules without any. */
export function mapInitiativeRules(app: App, mapPath: string | null | undefined): InitiativeRules {
  const { settings } = mapRules(app, mapPath);
  return settings ? collectionInitiativeRules(settings, systemPresetsOf(app)) : { ...DEFAULT_INITIATIVE_RULES };
}
