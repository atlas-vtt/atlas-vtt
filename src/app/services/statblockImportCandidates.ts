import { normalizePath, type App, type TFile } from 'obsidian';
import { getFantasyStatblocksApi, type FantasyStatblocksCreature } from './FantasyStatblocksService';
import { statblockDisplayName } from '../creatures/statblockRating';
import { boundedList } from '../creatures/statblockValues';
import type { TokenAsset } from './AssetService';
import type { BestiaryLookup } from '../creatures/linkedCreature';
import { tokenSizeFromStatblock } from '../pixi/token-renderer/tokenSizing';
import { statblockSourceOf } from '../statblocks/notes/statblockSource';
import { readStatblock } from '../statblocks/resolve/readStatblock';
import { STATBLOCK_IMAGE_KEYS, type StatblockImageKey } from './statblockImageKeys';
import { t } from '../i18n';
import { isVaultImage } from '../utils/vaultImage';
import { statblockImageFile } from '../statblocks/render/shared/statblockImage';

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
export function statblockImageField(fields: Readonly<Record<string, unknown>>): { key: StatblockImageKey; reference: string } | undefined {
  for (const key of STATBLOCK_IMAGE_KEYS) {
    const reference = imageReference(fields[key]);
    if (reference) return { key, reference };
  }
  return undefined;
}

/** The vault image a statblock's image reference (wikilink or path) points at, resolved relative to `sourcePath` (`statblockImageFile`). */
export function localImage(app: App, reference: string, sourcePath: string): TFile | null {
  const file = statblockImageFile(app, reference, sourcePath);
  return file !== null && isVaultImage(file) ? file : null;
}

/**
 * The bestiary a scan reads besides the notes: Fantasy Statblocks' once it
 * has resolved, and none without the plugin, when native statblocks and
 * Fantasy Statblocks' notes are read from the notes alone.
 */
export function requireResolvedBestiary(): FantasyStatblocksCreature[] {
  const api = getFantasyStatblocksApi();
  if (!api) return [];
  if (!api.isResolved()) throw new Error('Fantasy Statblocks is still loading. Try scanning again in a moment.');
  return api.getBestiaryCreatures();
}

/** Bestiary entries and the tokens linked to each note, by normalized note path. */
export interface StatblockLookup {
  creatures: ReadonlyMap<string, FantasyStatblocksCreature>;
  tokens: ReadonlyMap<string, readonly TokenAsset[]>;
  /** The same entries as the resolver reads them. */
  bestiary: BestiaryLookup;
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
  return { creatures, tokens, bestiary: { api: getFantasyStatblocksApi(), byPath: creatures } };
}

/**
 * The import row of a note, read by the resolver: its layout column names the template or
 * Fantasy Statblocks layout it renders with. Identity is always the note path; a matching
 * basename is not proof of a statblock.
 */
export async function statblockImportCandidate(app: App, file: TFile, lookup: StatblockLookup): Promise<StatblockImportCandidate | null> {
  const path = normalizePath(file.path);
  if (!lookup.creatures.has(path) && !(await statblockSourceOf(app, file))) return null;
  const statblock = await readStatblock(app, path, lookup.bestiary);
  const name = (statblock && statblockDisplayName(statblock.fields, statblock.meanings)) || file.basename;
  const row = { path, name, layoutName: statblock?.lookName ?? t('sbImport.unspecified') };
  // A note any token links already has its token; it may have several.
  const existing = lookup.tokens.get(path)?.[0];
  if (existing) return { ...row, status: 'imported', detail: t('sbCandidate.imported'), imagePath: existing.imagePath, showRing: existing.showRing !== false };
  if (!statblock) return { ...row, status: 'conflict', detail: t('sbCandidate.unresolved') };
  const { fields, meanings } = statblock;
  const image = statblockImageField(fields)?.reference;
  if (!image) return { ...row, status: 'missing-image', detail: t('sbCandidate.noImage') };
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(image)) return { ...row, status: 'remote-image', detail: t('sbCandidate.remote') };
  const imageFile = localImage(app, image, path);
  if (!imageFile) return { ...row, status: 'missing-image', detail: t('sbCandidate.missingImage') };
  const size = tokenSizeFromStatblock(fields, meanings);
  return { ...row, status: 'ready', detail: t('sbCandidate.ready'), imagePath: imageFile.path, ...(size !== undefined && { size }) };
}
