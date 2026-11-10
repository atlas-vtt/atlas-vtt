import type { Asset } from '../AssetService';
import type { BundleFile } from './bundleFormat';
import { noteName, noteTree, type NoteOrigin } from './noteTree';
import { baseName } from '../../utils/pathUtils';
import { t } from '../../i18n';

export type ContentCategory = 'scenes' | 'maps' | 'tokens' | 'encounters' | 'statblocks' | 'templates' | 'notes' | 'attachments' | 'loot';

/** How a token looks when spawned, and the statblock it opens. Paths are the vault's when exporting and the bundle's when importing. */
export interface TokenPreview {
  imagePath: string;
  thumbnailPath?: string | undefined;
  showRing: boolean;
  statblockPath?: string | undefined;
}

/** One asset or note of a collection, keyed like the import plan's units: `asset:<id>` or `file:<vault path>`. */
export interface ContentItem {
  key: string;
  name: string;
  token?: TokenPreview | undefined;
  /** Notes only: how many links from a scene the note is (see `noteTree`). */
  depth?: number | undefined;
  origin?: NoteOrigin | undefined;
  /** Notes only: how many notes were found through this one. */
  linked?: number | undefined;
}

export interface ContentGroup {
  category: ContentCategory;
  label: string;
  items: ContentItem[];
}

export const assetKey = (id: string): string => `asset:${id}`;
export const fileKey = (path: string): string => `file:${path}`;

/** Records of removed features (players, characters, statblock and note records) have no place here. */
const ASSET_CATEGORIES: Partial<Record<Asset['type'], ContentCategory>> = {
  scene: 'scenes', map: 'maps', token: 'tokens', encounter: 'encounters',
};

/** In display order; the ones people look for first are listed even when empty. */
const GROUPS: ReadonlyArray<{ category: ContentCategory; label: string; alwaysShown?: boolean }> = [
  { category: 'scenes', label: t('bundle.group.scenes'), alwaysShown: true },
  { category: 'maps', label: t('bundle.group.maps'), alwaysShown: true },
  { category: 'tokens', label: t('bundle.group.tokens') },
  { category: 'encounters', label: t('bundle.group.encounters') },
  { category: 'statblocks', label: t('bundle.group.statblocks'), alwaysShown: true },
  { category: 'templates', label: t('bundle.group.templates') },
  { category: 'notes', label: t('bundle.group.notes'), alwaysShown: true },
  { category: 'attachments', label: 'Images and PDFs' },
  { category: 'loot', label: 'Loot tables' },
];

const byName = (a: ContentItem, b: ContentItem): number => a.name.localeCompare(b.name, undefined, { numeric: true });

/** What a collection holds, grouped the way people think of it: scenes, maps, tokens, …, statblocks and their templates, notes and loot tables. */
export function groupContents(assets: readonly Asset[], files: readonly BundleFile[]): ContentGroup[] {
  const items = new Map<ContentCategory, ContentItem[]>();
  const add = (category: ContentCategory, item: ContentItem): void => {
    const list = items.get(category);
    if (list) list.push(item);
    else items.set(category, [item]);
  };
  for (const asset of assets) {
    const category = ASSET_CATEGORIES[asset.type];
    if (!category) continue;
    const item: ContentItem = { key: assetKey(asset.id), name: asset.name };
    if (asset.type === 'token') {
      item.token = { imagePath: asset.imagePath, thumbnailPath: asset.thumbnailPath, showRing: asset.showRing !== false, statblockPath: asset.statblockPath };
    }
    add(category, item);
  }
  for (const file of files) {
    if (file.role === 'statblock-note') add('statblocks', { key: fileKey(file.vaultPath), name: noteName(file.vaultPath) });
    if (file.role === 'statblock-template') add('templates', { key: fileKey(file.vaultPath), name: baseName(file.vaultPath).replace(/\.atlastemplate$/i, '') });
    if (file.role === 'note-attachment') add('attachments', { key: fileKey(file.vaultPath), name: baseName(file.vaultPath) });
    if (file.role === 'loot-base') add('loot', { key: fileKey(file.vaultPath), name: baseName(file.vaultPath).replace(/\.base$/i, '') });
  }
  const notes = noteTree(files, new Map(assets.map((asset) => [asset.id, asset.name])))
    .map(({ path, ...note }): ContentItem => ({ key: fileKey(path), ...note }));
  return GROUPS.flatMap(({ category, label, alwaysShown }): ContentGroup[] => {
    // Notes keep the order of their tree; everything else is listed by name.
    const grouped = category === 'notes' ? notes : (items.get(category) ?? []).sort(byName);
    return grouped.length > 0 || alwaysShown ? [{ category, label, items: grouped }] : [];
  });
}

export interface SelectedContent {
  assets: Asset[];
  files: BundleFile[];
}

/**
 * What an export packs once the user left out `excluded` content: the
 * remaining assets, and the files still used by one of them. A file a note
 * links to goes with any note that still links to it, a loot item with the
 * bases that hold it, statblock artwork with the notes that show it, and every
 * other file with the assets that own it.
 */
export function selectContent(assets: readonly Asset[], files: readonly BundleFile[], excluded: ReadonlySet<string>): SelectedContent {
  const kept = assets.filter((asset) => !excluded.has(assetKey(asset.id)));
  const keptIds = new Set(kept.map((asset) => asset.id));
  const allowed = files.filter((file) => !excluded.has(fileKey(file.vaultPath)));
  const usedByAsset = (file: BundleFile): boolean => (file.owners?.length ? file.owners.some((owner) => keptIds.has(owner)) : !file.linkedFrom?.length);
  const packed = new Set(allowed.filter(usedByAsset).map((file) => file.vaultPath));
  const stillLinked = (file: BundleFile): boolean => file.linkedFrom?.some((note) => packed.has(note)) ?? false;
  // ponytail: repeated passes, one per level of links; walk a queue of children if a vault's notes ever make this slow.
  let grew = true;
  while (grew) {
    grew = false;
    for (const file of allowed) {
      if (packed.has(file.vaultPath) || !stillLinked(file)) continue;
      packed.add(file.vaultPath);
      grew = true;
    }
  }
  const shownArtwork = new Set(allowed.flatMap((file) => (file.statblockImage && packed.has(file.vaultPath) ? [file.statblockImage.path] : [])));
  // Artwork follows its notes, not its owners: a statblock note may travel only because a kept note links to it.
  const travels = (file: BundleFile): boolean => (file.role === 'statblock-image'
    ? shownArtwork.has(file.vaultPath) || stillLinked(file)
    : packed.has(file.vaultPath));
  return {
    assets: kept,
    files: allowed
      .filter(travels)
      .map((file): BundleFile => ({
        ...file,
        ...(file.owners && { owners: file.owners.filter((owner) => keptIds.has(owner)) }),
        ...(file.linkedFrom && { linkedFrom: file.linkedFrom.filter((note) => packed.has(note)) }),
      })),
  };
}

/** The content keys of everything `selectContent` kept. */
export function selectedKeys({ assets, files }: SelectedContent): Set<string> {
  return new Set([...assets.map((asset) => assetKey(asset.id)), ...files.map((file) => fileKey(file.vaultPath))]);
}
