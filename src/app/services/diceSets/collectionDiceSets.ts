import type { App } from 'obsidian';
import { BUILT_IN_DICE_SETS } from '../../gameSystems/builtInDiceSets';
import { collectionDiceSet, defaultDiceSet } from '../../gameSystems/diceSetResolution';
import type { DiceSet } from '../../types/diceSetTypes';
import { AssetService } from '../AssetService';
import { systemPresetsOf } from '../mapCollectionRules';
import { mapRules } from '../mapRules';
import { DiceSetFiles } from './DiceSetFiles';
import { DiceSetService } from './DiceSetService';

/** The vault's dice sets, while the plugin has their files open; null in a test that opened none. */
export function diceSetServiceOf(app: App | undefined): DiceSetService | null {
  const files = DiceSetFiles.forApp(app);
  return files ? new DiceSetService(files) : null;
}

/** Every dice set of the vault: the built-in ones, and the library's once its files are open. */
export function diceSetsOf(app: App): readonly DiceSet[] {
  return diceSetServiceOf(app)?.list() ?? BUILT_IN_DICE_SETS;
}

/**
 * The dice set the map plays by: that of the rules `mapRules` gives it (the played campaign's
 * system, else the collection's), resolved as a collection's (`collectionDiceSet`); the d20 for a
 * map without rules.
 */
export function mapDiceSet(app: App, mapPath: string | null | undefined): DiceSet {
  const { settings } = mapRules(app, mapPath);
  return settings ? collectionDiceSet(settings, systemPresetsOf(app), diceSetsOf(app)) : defaultDiceSet();
}

/** The dice set of a collection (a statblock pane's); the d20 without one. */
export function diceSetOfCollection(app: App, collectionId: string | null): DiceSet {
  if (!collectionId) return defaultDiceSet();
  const settings = AssetService.getInstance(app).getCollectionSettings(collectionId);
  return collectionDiceSet(settings, systemPresetsOf(app), diceSetsOf(app));
}
