import type { App } from 'obsidian';
import { initiativeRulesForMap } from '../gameSystems/initiativeRules';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import { systemPresetsOf } from './mapCollectionRules';
import { rulesLookup } from './mapRules';

/** Initiative rules the map plays by (`initiativeRulesForMap`), with the vault's presets. */
export function mapInitiativeRules(app: App, mapPath: string | null | undefined): InitiativeRules {
  return initiativeRulesForMap(rulesLookup(app), systemPresetsOf(app), mapPath);
}
