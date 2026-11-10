import { COLLECTIONS_DIR, ATLAS_VTT_DIR, GLOBAL_ASSETS_DIR } from '../AssetService';
import { ID_MATCHED_ROLES, REUSABLE_FILE_ROLES, SNAPSHOT_FILE_ROLES, type BundleFile, type BundleFileRole } from './bundleFormat';
import { sceneThumbnailPath } from './collectionReferences';
import { baseName, parentPath } from '../../utils/pathUtils';
import { sceneSnapshotFolder } from '../../snapshots/snapshotPaths';
import { mapStrings } from '../../utils/mapStrings';
import { TEMPLATE_FOLDER, templateFileName, templatePathIn } from '../../statblocks/library/templatePaths';

const GLOBAL_ASSETS_PREFIX = `${GLOBAL_ASSETS_DIR}/`;

export type PathMap = ReadonlyMap<string, string>;

/** A note link keeps its heading or block: `Notes/Cave.md#Entrance` follows `Notes/Cave.md`. */
function remapLink(text: string, map: PathMap): string {
  const hash = text.indexOf('#');
  const target = hash > 0 ? map.get(text.slice(0, hash)) : undefined;
  return target ? `${target}${text.slice(hash)}` : text;
}

/**
 * Returns `value` with every string that exactly equals a known vault path
 * replaced by its new path, and every note link into such a path following it.
 * Works on asset records, scene JSON and whole `.atlasmap` files alike, since
 * all of them store paths as plain strings.
 */
export function remapPaths<T>(value: T, map: PathMap): T {
  return mapStrings(value, (text) => map.get(text) ?? remapLink(text, map));
}

/**
 * The folders that went along with the files of `map`, read off the files' own
 * moves: `Items/Armor` → `…/loot/Items/Armor` when `Items/Armor/Shield.md` went
 * there, and likewise each folder above it that kept its name, up to the first
 * one that did not (a collection's folder under its new name). A folder whose
 * files went to different places is left out.
 */
export function movedFolders(map: PathMap): Map<string, string> {
  const folders = new Map<string, string | null>();
  const note = (source: string, target: string): void => {
    folders.set(source, folders.has(source) && folders.get(source) !== target ? null : target);
  };
  for (const [source, target] of map) {
    let from = parentPath(source);
    let to = parentPath(target);
    let followed = false;
    while (from && to && from !== to && baseName(from) === baseName(to)) {
      note(from, to);
      from = parentPath(from);
      to = parentPath(to);
      followed = true;
    }
    if (followed && from && to && from !== to) note(from, to);
  }
  return new Map([...folders].flatMap(([source, target]) => (target === null ? [] : [[source, target]])));
}

const LOOT_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['loot-base', 'loot-item']);
const NOTE_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['linked-note', 'note-attachment']);

/**
 * Where a file without a place of its own in the target collection is copied
 * to, by what it is. Loot and notes keep the folders they had, below `loot`
 * and `notes`: a base finds its items by their folders, and Obsidian finds a
 * link's target by its name or by the end of its path, so the links between
 * notes resolve without rewriting any note.
 */
function copyFolder(file: BundleFile, collectionId: string): string {
  const collection = `${COLLECTIONS_DIR}/${collectionId}`;
  if (REUSABLE_FILE_ROLES.has(file.role)) return `${collection}/statblocks`;
  if (LOOT_ROLES.has(file.role)) return [collection, 'loot', parentPath(file.vaultPath)].filter(Boolean).join('/');
  if (NOTE_ROLES.has(file.role)) return [collection, 'notes', parentPath(file.vaultPath)].filter(Boolean).join('/');
  return `${collection}/files`;
}

/** The file's own name in `folder`, or `goblin-2.png`, `goblin-3.png`, … while that name is taken. */
export function freePathIn(folder: string, name: string, isTaken: (path: string) => boolean): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let path = `${folder}/${name}`;
  for (let n = 2; isTaken(path); n++) path = `${folder}/${stem}-${n}${extension}`;
  return path;
}

/**
 * Where an import puts statblock templates (§4.3): in the library folder, never in the
 * collection, under their own name; a name another file has takes the collection's name in
 * brackets ("Marsh creature (Fen)"), then a number. `isTaken` answers for the vault in any
 * letter case; every path given out is taken from then on.
 */
export function templatePlacer(collectionName: string, isTaken: (path: string) => boolean): (name: string) => string {
  const claimed = new Set<string>();
  const taken = (path: string): boolean => claimed.has(path.toLowerCase()) || isTaken(path);
  return (name) => {
    const stem = templateFileName(name);
    const marked = `${stem} (${templateFileName(collectionName)})`;
    let path = templatePathIn(TEMPLATE_FOLDER, stem);
    if (taken(path)) path = templatePathIn(TEMPLATE_FOLDER, marked);
    for (let n = 2; taken(path); n++) path = templatePathIn(TEMPLATE_FOLDER, `${marked} ${n}`);
    claimed.add(path.toLowerCase());
    return path;
  };
}

/** The scene map among `mapPaths` that a scene thumbnail belongs to, found by where it lies. */
export function sceneMapOf(file: BundleFile, mapPaths: readonly string[]): string | undefined {
  return file.role === 'scene-thumbnail' ? mapPaths.find((map) => sceneThumbnailPath(map) === file.vaultPath) : undefined;
}

/** Where a scene's thumbnail goes when its map goes to `mapTarget`. */
export const besideMap = (mapTarget: string): string => sceneThumbnailPath(mapTarget);

export interface ImportPathRules {
  sourceCollectionId: string;
  targetCollectionId: string;
  existsInVault(path: string): boolean;
  /** Whether the vault's file at the bundle file's own path has the same content, so it can be shared. */
  hasSameContent(file: BundleFile): boolean;
  /**
   * Vault paths the collection's install record gives its files. With a record,
   * any other file in the collection's folder is the user's own; without one
   * (copies from before install records), the folder's files are the earlier install.
   */
  recordTargets: ReadonlySet<string> | null;
  /** The id in this vault of the scene a snapshot file belongs to; null when no scene of the bundle claims it. */
  sceneOfSnapshot(file: BundleFile): string | null;
}

/**
 * Decides the vault path every bundled file gets in the importing vault, so
 * that no two files share a target and no file the user owns is taken over.
 * Files with a fixed place come first: the source collection's files move to
 * the target collection's folder, shared artwork in `atlas-vtt/assets/` keeps
 * its path when that is free or holds the same content, and statblock notes
 * and artwork the vault already has are reused where they are. Everything else
 * is copied into the collection under a free name. Statblock templates are left
 * out: they are matched by template id, not by path.
 */
export function planImportPaths(files: readonly BundleFile[], rules: ImportPathRules): PathMap {
  const plan = new Map<string, string>();
  const claimed = new Set<string>(rules.recordTargets ?? []);
  const sourcePrefix = `${COLLECTIONS_DIR}/${rules.sourceCollectionId}/`;
  const targetPrefix = `${COLLECTIONS_DIR}/${rules.targetCollectionId}/`;
  const isUsersFile = (path: string): boolean => rules.existsInVault(path) && !rules.recordTargets?.has(path)
    && (rules.recordTargets !== null || !path.startsWith(targetPrefix));
  const isTaken = (path: string): boolean => claimed.has(path) || isUsersFile(path);
  const place = (file: BundleFile, target: string): void => {
    claimed.add(target);
    plan.set(file.vaultPath, target);
  };

  // A scene's thumbnail is found next to its map, so it takes whatever name the map gets.
  const mapPaths = files.filter((file) => file.role === 'scene-map').map((file) => file.vaultPath);
  // A scene's snapshots are found by its id, so they go to the folder of the id it has here.
  const snapshots: Array<{ file: BundleFile; folder: string }> = [];

  const unplaced: Array<{ file: BundleFile; folder: string }> = [];
  const besideMaps: Array<{ file: BundleFile; map: string }> = [];
  for (const file of files) {
    // Templates (with their notes), presets and dice sets are placed by their id (`templatePlacer`, `planRecords`), not by their path.
    if (ID_MATCHED_ROLES.has(file.role)) continue;
    const path = file.vaultPath;
    const map = sceneMapOf(file, mapPaths);
    const scene = SNAPSHOT_FILE_ROLES.has(file.role) ? rules.sceneOfSnapshot(file) : null;
    if (map) besideMaps.push({ file, map });
    else if (scene) snapshots.push({ file, folder: sceneSnapshotFolder(rules.targetCollectionId, scene) });
    else if (path.startsWith(sourcePrefix)) {
      const target = `${targetPrefix}${path.slice(sourcePrefix.length)}`;
      if (isUsersFile(target)) unplaced.push({ file, folder: parentPath(target) });
      else place(file, target);
    } else if (path.startsWith(GLOBAL_ASSETS_PREFIX)) {
      if (!rules.existsInVault(path) || rules.hasSameContent(file)) place(file, path);
      else unplaced.push({ file, folder: parentPath(path) });
    } else if (REUSABLE_FILE_ROLES.has(file.role) && !path.startsWith(`${ATLAS_VTT_DIR}/`) && rules.existsInVault(path)) {
      place(file, path);
    } else {
      unplaced.push({ file, folder: copyFolder(file, rules.targetCollectionId) });
    }
  }
  for (const { file, folder } of unplaced) place(file, freePathIn(folder, baseName(file.vaultPath), isTaken));
  for (const { file, map } of besideMaps) {
    const target = besideMap(plan.get(map)!);
    place(file, isTaken(target) ? freePathIn(parentPath(target), baseName(target), isTaken) : target);
  }
  // A snapshot keeps its id as its name: a file of that name in its scene's folder is that same snapshot, installed or carried over before.
  for (const { file, folder } of snapshots) place(file, freePathIn(folder, baseName(file.vaultPath), (path) => claimed.has(path)));
  return plan;
}
