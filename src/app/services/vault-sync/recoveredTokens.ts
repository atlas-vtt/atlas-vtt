import type { Asset, AssetMetadata, GroupTokenRef, TokenAsset } from '../AssetService';
import { GLOBAL_ASSETS_DIR } from '../assetPaths';
import { defaultCollectionIdOf } from '../collectionRecords';
import { groupTokenRefs, ownedPaths, primaryPath } from './assetFiles';
import { isRecoveredId, recoveredId, recoveredTokenName, stemOf } from './recoveredIds';
import { prettifyIdentifier } from '../collectionRecords';
import { isReservedCollectionPath } from './reservedPaths';

const COLLECTION_TOKEN = /^atlas-vtt\/collections\/([^/]+)\/(?:.+\/)?tokens\/.+$/i;
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const GROUP_THUMBNAILS = [`${GLOBAL_ASSETS_DIR}/encounter-thumbnails/`, `${GLOBAL_ASSETS_DIR}/player-thumbnails/`];

/** Token art used by encounters and player groups, with the collection of the first group that uses it. */
function groupArtwork(metadata: AssetMetadata): Map<string, string> {
  const art = new Map<string, string>();
  for (const asset of Object.values(metadata.assets)) {
    if (asset.type !== 'encounter' && asset.type !== 'player') continue;
    for (const token of groupTokenRefs(asset)) {
      if (typeof token?.imagePath === 'string' && token.imagePath) art.set(token.imagePath, asset.collection || defaultCollectionIdOf(metadata));
    }
  }
  return art;
}

/**
 * Removes records earlier recoveries made from images that are no token
 * (encounter thumbnails, stray global images) and names recovered tokens nobody
 * renamed after their file without Atlas's suffix. Returns whether anything changed.
 */
export function tidyRecoveredTokens(metadata: AssetMetadata, now: number): boolean {
  const groupArt = groupArtwork(metadata);
  let changed = false;
  for (const [id, asset] of Object.entries(metadata.assets)) {
    if (asset.type !== 'token' || !asset.imagePath) continue;
    const recovered = id.startsWith('token-recovered-');
    const isGroupThumbnail = GROUP_THUMBNAILS.some((prefix) => asset.imagePath.startsWith(prefix));
    if (isGroupThumbnail || (recovered && !COLLECTION_TOKEN.test(asset.imagePath) && !groupArt.has(asset.imagePath))) {
      delete metadata.assets[id];
      changed = true;
      continue;
    }
    // Only a name an earlier recovery took from the file name, suffix and all; a name the user chose stays.
    const stem = stemOf(asset.imagePath);
    const fromFileName = asset.name === stem || asset.name === prettifyIdentifier(stem);
    const name = recovered && fromFileName ? recoveredTokenName(asset.imagePath) : asset.name;
    if (name && name !== asset.name) {
      asset.name = name;
      asset.modifiedAt = now;
      changed = true;
    }
  }
  return changed;
}

/** Fields a rebuilt token got from rebuilding (`adoptTokenArtwork`), not from the user. */
const REBUILT_FIELDS = new Set(['id', 'type', 'name', 'imagePath', 'tags', 'collection', 'createdAt', 'modifiedAt']);

/**
 * Passes to `owner` what the user did with a token an older version rebuilt from
 * the same art: a name other than the one its file gives, its tags, and every
 * field rebuilding never sets (a statblock link, a size). A name or field the
 * owner was edited to later stays; one the owner lacks is always passed.
 */
function passEdits(rebuilt: TokenAsset, owner: TokenAsset): void {
  const later = rebuilt.modifiedAt > owner.modifiedAt;
  const stem = stemOf(rebuilt.imagePath);
  const named = rebuilt.name !== recoveredTokenName(rebuilt.imagePath) && rebuilt.name !== stem && rebuilt.name !== prettifyIdentifier(stem);
  const held = new Set(Object.entries(owner).filter(([, value]) => value !== undefined).map(([key]) => key));
  const edits: Partial<TokenAsset> = Object.fromEntries(Object.entries(rebuilt)
    .filter(([key]) => !REBUILT_FIELDS.has(key) && (later || !held.has(key))));
  if (later && named) edits.name = rebuilt.name;
  const ownTags = owner.tags ?? [];
  const tags = [...new Set([...ownTags, ...(rebuilt.tags ?? [])])];
  if (tags.length !== ownTags.length) edits.tags = tags;
  if (Object.keys(edits).length === 0) return;
  Object.assign(owner, edits);
  owner.modifiedAt = Math.max(owner.modifiedAt, rebuilt.modifiedAt);
}

/** Points every encounter and player group at `to` where it names `from`; no edit of theirs, so `modifiedAt` stays and a real edit elsewhere still wins. */
function moveGroupRefs(metadata: AssetMetadata, from: string, to: string): boolean {
  let changed = false;
  for (const asset of Object.values(metadata.assets)) {
    if (asset.type !== 'encounter' && asset.type !== 'player') continue;
    const lists = [asset.tokens, asset.data?.tokens].filter((list): list is GroupTokenRef[] => Array.isArray(list));
    let moved = false;
    for (const list of lists) {
      for (const [index, ref] of list.entries()) {
        if (ref?.id !== from) continue;
        list[index] = { ...ref, id: to };
        moved = true;
      }
    }
    changed ||= moved;
  }
  return changed;
}

/**
 * Removes records an earlier check rebuilt from a file that a real record now
 * owns: a sync tool delivered the art or map before the record that goes with
 * it, or an older version on another device adopted the same art. What the user
 * did with a rebuilt token is kept: their edits pass to the real record
 * (`passEdits`), and encounters and player groups that name it name the real
 * record instead. Returns whether anything changed.
 */
export function dropShadowedRecoveries(metadata: AssetMetadata): boolean {
  const owners = new Map<string, Asset>();
  for (const asset of Object.values(metadata.assets)) {
    if (!isRecoveredId(asset.id)) for (const path of ownedPaths(asset)) owners.set(path, asset);
  }
  let changed = false;
  for (const [id, asset] of Object.entries(metadata.assets)) {
    const primary = primaryPath(asset);
    const owner = primary ? owners.get(primary) : undefined;
    if (!isRecoveredId(id) || !owner) continue;
    if (asset.type === 'token' && owner.type === 'token') {
      passEdits(asset, owner);
      moveGroupRefs(metadata, id, owner.id);
    }
    delete metadata.assets[id];
    changed = true;
  }
  return changed;
}

/**
 * Takes token art without a record into the index: images in a collection's
 * tokens folder, and images encounters or player groups use. `owned` holds the
 * paths records already own and grows with every adopted image.
 */
export function adoptTokenArtwork(metadata: AssetMetadata, files: ReadonlySet<string>, owned: Set<string>, now: number): boolean {
  const groupArt = groupArtwork(metadata);
  let changed = false;
  for (const path of [...files].sort()) {
    if (!IMAGE.test(path) || owned.has(path) || isReservedCollectionPath(path)) continue;
    const collection = COLLECTION_TOKEN.exec(path)?.[1] ?? groupArt.get(path);
    const id = recoveredId('token', path);
    if (!collection || metadata.assets[id]) continue;

    const token: TokenAsset = {
      id,
      type: 'token',
      name: recoveredTokenName(path),
      imagePath: path,
      tags: [],
      collection,
      createdAt: now,
      modifiedAt: now,
    };
    metadata.assets[id] = token;
    owned.add(path);
    changed = true;
  }
  return changed;
}
