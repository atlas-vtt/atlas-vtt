import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { legacyCollectionResources } from '../../resources/collectionResources';
import { sameResourceDefinitions } from '../../resources/resourceDefinitions';
import { collectionStatblockRoles, sameStatblockRoles } from '../../statblocks/roles/collectionStatblockRoles';
import { withSettingsTemplates, type TemplateIdMap } from '../../statblocks/bundles/bundleTemplateIds';
import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import type { SystemPreset } from '../../types/systemPresetTypes';
import type { CollectionMetadata } from '../AssetService';
import { collectionFolderPath } from '../assetPaths';

/**
 * A collection's settings as bundles compare them. Resources that only restate what the
 * settings read as before resources were stored are left out: Atlas stores them by itself
 * (`storeLegacyResources`), which is no edit of the GM's. Nor is what players see. Roles equal
 * to those the settings read from their preset (`presets`, the generic pair without one) are
 * left out too: a bundle writes out a user preset's roles (`withPresetRoles`), which the
 * collection it was made from reads unset.
 */
export function comparableSettings(
  settings: CollectionSettings | undefined,
  presets: readonly SystemPreset[] = BUILT_IN_SYSTEM_PRESETS,
): Partial<CollectionSettings> | undefined {
  if (!settings) return settings;
  const { resources, statblockRoles, ...rest } = settings;
  const ownResources = resources !== undefined
    && !sameResourceDefinitions(resources, legacyCollectionResources(rest, BUILT_IN_SYSTEM_PRESETS));
  // An empty list is none: the collection reads its preset's
  const ownRoles = !!statblockRoles?.length
    && !sameStatblockRoles(statblockRoles, collectionStatblockRoles({ systemPresetId: rest.systemPresetId }, presets));
  return { ...rest, ...(ownResources && { resources }), ...(ownRoles && { statblockRoles }) };
}

/** `settings` with each loot base at the path `pathOf` gives it; a base without one is left out. */
export function withLootBases(settings: CollectionSettings, pathOf: (path: string) => string | undefined): CollectionSettings {
  const { lootBases } = settings;
  return lootBases ? { ...settings, lootBases: lootBases.flatMap((path) => pathOf(path) ?? []) } : settings;
}

/**
 * `settings` with each role's folder at the folder `folderOf` gives it; a folder without one
 * is left out, so new statblocks of that role go to Obsidian's location for new notes.
 */
export function withRoleFolders(settings: CollectionSettings, folderOf: (folder: string) => string | undefined): CollectionSettings {
  const folders = settings.statblockRoleFolders;
  if (!folders) return settings;
  const moved = Object.entries(folders).flatMap(([roleId, folder]): Array<[string, string]> => {
    const target = folderOf(folder);
    return target ? [[roleId, target]] : [];
  });
  const { statblockRoleFolders: _folders, ...rest } = settings;
  return moved.length > 0 ? { ...rest, statblockRoleFolders: Object.fromEntries(moved) } : rest;
}

/**
 * The settings a bundle carries: roles the collection reads from a user preset written out,
 * since the recipient may not have that preset (its `systemPresetId` then names nothing). A
 * built-in preset's roles stay unset: every Atlas has them.
 */
export function withPresetRoles(settings: CollectionSettings, presets: readonly SystemPreset[]): CollectionSettings {
  if (settings.statblockRoles?.length) return settings;
  const preset = presets.find((candidate) => candidate.id === settings.systemPresetId);
  const roles = preset?.rules.statblockRoles;
  return preset && !preset.builtIn && roles?.length ? { ...settings, statblockRoles: structuredClone(roles) } : settings;
}

/** The settings an import takes from a bundle. One written by an older Atlas names no resources: the vault keeps its own. */
export function settingsFromBundle(theirs: CollectionSettings, mine: CollectionSettings | undefined): CollectionSettings {
  return theirs.resources || !mine?.resources ? theirs : { ...theirs, resources: mine.resources };
}

/** `folder` at the same place below `to` when it lies below `from` (or is it); undefined otherwise. */
export function folderBelow(folder: string, from: string, to: string): string | undefined {
  if (folder === from) return to;
  return folder.startsWith(`${from}/`) ? `${to}${folder.slice(from.length)}` : undefined;
}

/** How a bundle names what the settings point at: a packed file's path, and a folder of the collection's. */
export interface BundledPaths {
  /** The bundle's path of a file it packs; undefined for one it leaves behind. */
  file: (path: string) => string | undefined;
  /** The bundle's path of a folder inside the collection's; undefined for a folder outside it. */
  folder: (folder: string) => string | undefined;
}

/**
 * The settings an export carries: only the loot bases that travel, roles read from a user preset
 * written out (`withPresetRoles`), and role folders
 * inside the collection's folder.
 * A role folder outside it is left out: the recipient's vault may not have it, and new
 * statblocks of that role then go where Obsidian puts new notes.
 */
export function exportedSettings(settings: CollectionSettings, presets: readonly SystemPreset[], paths: BundledPaths): CollectionSettings {
  return withRoleFolders(withPresetRoles(withLootBases(settings, paths.file), presets), paths.folder);
}

/** Where an import puts what the bundle's settings point at. */
export interface ImportedPlaces {
  collectionId: string;
  /** Bundle path → vault path. */
  paths: ReadonlyMap<string, string>;
  /** Bundle template id → id here. */
  templateIds: TemplateIdMap;
  /** Bundle preset id → id here, where the vault's own preset differed and the bundle's came in as a copy. */
  presetIds?: ReadonlyMap<string, string> | undefined;
  /** Bundle dice set id → id here, where the vault's own set differed and the bundle's came in as a copy. */
  diceSetIds?: ReadonlyMap<string, string> | undefined;
}

/** Settings whose game system is the preset's id in this vault. */
function withPresetId<T extends { systemPresetId?: string | undefined }>(settings: T, ids: ReadonlyMap<string, string> | undefined): T {
  const id = settings.systemPresetId && ids?.get(settings.systemPresetId);
  return id ? { ...settings, systemPresetId: id } : settings;
}

/** Settings whose dice set is the set's id in this vault. */
function withDiceSetId<T extends { diceSetId?: string | undefined }>(settings: T, ids: ReadonlyMap<string, string> | undefined): T {
  const id = settings.diceSetId && ids?.get(settings.diceSetId);
  return id ? { ...settings, diceSetId: id } : settings;
}

/** Settings whose game system and dice set are the ids the preset and the set have in this vault. */
export function withRecordIds<T extends { systemPresetId?: string | undefined; diceSetId?: string | undefined }>(settings: T, places: Pick<ImportedPlaces, 'presetIds' | 'diceSetIds'>): T {
  return withDiceSetId(withPresetId(settings, places.presetIds), places.diceSetIds);
}

/**
 * The bundle's settings as the import stores them: its loot bases at the paths they get in this
 * vault, its roles on the templates' ids here, its game system and dice set the ids
 * the preset and the set have here, its role folders in the collection's folder here (a folder
 * outside the collection is left out).
 */
export function importedSettings(collection: CollectionMetadata, places: ImportedPlaces): CollectionSettings {
  const withPaths = withRecordIds(withLootBases(collection.settings, (path) => places.paths.get(path) ?? path), places);
  const from = collectionFolderPath(collection.id);
  const to = collectionFolderPath(places.collectionId);
  return withRoleFolders(withSettingsTemplates(withPaths, places.templateIds), (folder) => folderBelow(folder, from, to));
}
