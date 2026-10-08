import { TFile, normalizePath, type App } from 'obsidian';
import { getFantasyStatblocksApi, resolveCreatureFromFence, resolveLayout, type FantasyStatblocksCreature } from './FantasyStatblocksService';
import { resolveStatblockNote } from './statblockNoteSource';
import { boundedList } from '../creatures/statblockValues';
import type { TokenAsset } from './AssetService';
import { tokenSizeFromCreatureSize } from '../pixi/token-renderer/tokenSizing';
import { STATBLOCK_IMAGE_KEYS, type StatblockImageKey } from './statblockImageKeys';
import { t } from '../i18n';

export type StatblockImportStatus = 'ready' | 'imported' | 'missing-image' | 'remote-image' | 'conflict';
export interface StatblockImportCandidate {
  path: string;
  name: string;
  status: StatblockImportStatus;
  detail: string;
  imagePath?: string;
  layoutName?: string;
  showRing?: boolean;
  /** Default token footprint read from the creature's size, when it names one. */
  size?: number;
}

/** Fantasy Statblocks hands out bestiary creatures with links encoded as `<STATBLOCK-WIKI-LINK>path|alias<STATBLOCK-WIKI-LINK>`. */
const ENCODED_STATBLOCK_LINK = /^<STATBLOCK-(WIKI|MARKDOWN)-LINK>([\s\S]+?)(?:\|[\s\S]*)?<STATBLOCK-\1-LINK>$/;

function decodeStatblockLink(reference: string): string {
  const [, kind, path] = ENCODED_STATBLOCK_LINK.exec(reference) ?? [];
  if (!path) return reference;
  if (kind === 'WIKI') return path.trim();
  try { return decodeURI(path.trim()); } catch { return path.trim(); }
}

/** YAML interprets unquoted [[links]] as nested arrays. */
export function imageReference(value: unknown): string | undefined {
  const reference = typeof value === 'string' ? value.trim()
    : Array.isArray(value) ? boundedList(value).flat(Infinity).find((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim()))?.trim()
    : undefined;
  return reference ? decodeStatblockLink(reference) : undefined;
}

/** The first artwork field of a statblock that holds a reference, with that reference. */
export function statblockImageField(fields: Record<string, unknown>): { key: StatblockImageKey; reference: string } | undefined {
  for (const key of STATBLOCK_IMAGE_KEYS) {
    const reference = imageReference(fields[key]);
    if (reference) return { key, reference };
  }
  return undefined;
}

/** The vault image a frontmatter reference (wikilink or path) points at, resolved relative to `sourcePath`. */
export function localImage(app: App, reference: string, sourcePath: string): TFile | null {
  const path = reference.replace(/^!?\[\[|\]\]$/g, '').split('|')[0]?.split('#')[0]?.trim();
  if (!path) return null;
  const resolved = app.metadataCache.getFirstLinkpathDest(path, sourcePath) ?? app.vault.getAbstractFileByPath(normalizePath(path));
  return resolved instanceof TFile && /^(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(resolved.extension) ? resolved : null;
}

export function requireResolvedBestiary(): FantasyStatblocksCreature[] {
  const api = getFantasyStatblocksApi();
  if (!api) throw new Error('Enable Fantasy Statblocks to import creatures.');
  if (!api.isResolved()) throw new Error('Fantasy Statblocks is still loading. Try scanning again in a moment.');
  return api.getBestiaryCreatures();
}

/** Bestiary entries and the tokens linked to each note, by normalized note path. */
export interface StatblockLookup {
  creatures: ReadonlyMap<string, FantasyStatblocksCreature>;
  tokens: ReadonlyMap<string, readonly TokenAsset[]>;
}

/** Built once per scan: looking notes up in the bestiary one by one grows with notes × creatures. */
export function statblockLookup(assets: readonly TokenAsset[], bestiary: readonly FantasyStatblocksCreature[]): StatblockLookup {
  const creatures = new Map<string, FantasyStatblocksCreature>();
  for (const creature of bestiary) {
    const path = creature.path && normalizePath(creature.path);
    if (path && !creatures.has(path)) creatures.set(path, creature);
  }
  const tokens = new Map<string, TokenAsset[]>();
  for (const asset of assets) {
    if (!asset.statblockPath) continue;
    const path = normalizePath(asset.statblockPath);
    tokens.set(path, [...(tokens.get(path) ?? []), asset]);
  }
  return { creatures, tokens };
}

/** Identity is always the note path; a matching basename is not proof of a statblock. */
export async function statblockImportCandidate(app: App, file: TFile, lookup: StatblockLookup): Promise<StatblockImportCandidate | null> {
  const path = normalizePath(file.path);
  const entry = lookup.creatures.get(path);
  const source = await resolveStatblockNote(app, file);
  if (!source && !entry) return null;
  const creature = source?.kind === 'codeblock'
    ? await resolveCreatureFromFence(app, source.params, path)
    : entry ?? app.metadataCache.getFileCache(file)?.frontmatter;
  const name = typeof creature?.name === 'string' && creature.name.trim() ? creature.name : file.basename;
  const requested = typeof creature?.layout === 'string' ? creature.layout :
    typeof creature?.statblock === 'string' && !['true', 'inline'].includes(creature.statblock) ? creature.statblock : undefined;
  const layout = resolveLayout(app, requested);
  const layoutName = requested ? (layout?.id === requested || layout?.name === requested ? layout.name : requested) : layout?.name ?? t('sbImport.unspecified');
  const row = { path, name, layoutName };
  const linked = lookup.tokens.get(path) ?? [];
  if (linked.length > 1) return { ...row, status: 'conflict', detail: t('sbCandidate.conflict') };
  const existing = linked[0];
  if (existing) return { ...row, status: 'imported', detail: t('sbCandidate.imported'), imagePath: existing.imagePath, showRing: existing.showRing !== false };
  if (!creature) return { ...row, status: 'conflict', detail: t('sbCandidate.unresolved') };
  const image = statblockImageField(creature)?.reference;
  if (!image) return { ...row, status: 'missing-image', detail: t('sbCandidate.noImage') };
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(image)) return { ...row, status: 'remote-image', detail: t('sbCandidate.remote') };
  const imageFile = localImage(app, image, path);
  if (!imageFile) return { ...row, status: 'missing-image', detail: t('sbCandidate.missingImage') };
  const size = tokenSizeFromCreatureSize(creature.size);
  return { ...row, status: 'ready', detail: t('sbCandidate.ready'), imagePath: imageFile.path, ...(size !== undefined && { size }) };
}
