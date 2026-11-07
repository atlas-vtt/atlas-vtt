import type { App } from 'obsidian';
import { boundedFields, valueText } from '../creatures/statblockValues';
import { collectionItemRarities } from '../gameSystems/itemRarities';
import { AssetService } from '../services/AssetService';
import { systemPresetsOf } from '../services/mapCollectionRules';
import { toLootItems } from './lootItem';
import { toDraw, type LootDraw } from './lootRoller';

/** The collection that rolls on the base, or null when it is no collection's loot base. */
export function lootBaseCollection(app: App, basePath: string): string | null {
  const assets = AssetService.getInstance(app);
  const owner = assets.loadedCollections().find((collection) => assets.getCollectionSettings(collection.id).lootBases?.includes(basePath));
  return owner?.id ?? null;
}

/** The columns a base's table shows: property ids in their order, with the names it gives them. */
export interface BaseColumns {
  order: string[];
  displayNames: Record<string, string>;
}

/**
 * An item note of a loot base as the roller would have drawn it: its properties read from the
 * note (bounded, it is the user's text), roles and shown properties by the table's columns, price
 * and rarity by the collection's currency and words.
 */
export function baseItemDraw(app: App, basePath: string, notePath: string, columns: BaseColumns): LootDraw | null {
  const collectionId = lootBaseCollection(app, basePath);
  const file = app.vault.getFileByPath(notePath);
  if (collectionId === null || file === null) return null;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(boundedFields(app.metadataCache.getFileCache(file)?.frontmatter ?? {}))) {
    const text = valueText(value).trim();
    if (text) values[`note.${key}`] = text;
  }
  const snapshot = { entries: [{ path: file.path, name: file.basename, values }], ...columns };
  const [item] = toLootItems(snapshot, [basePath.replace(/^.*\//, '').replace(/\.base$/, '')]);
  if (!item) return null;
  const settings = AssetService.getInstance(app).getCollectionSettings(collectionId);
  return toDraw(item, settings.lootCurrency, collectionItemRarities(settings, systemPresetsOf(app)));
}
