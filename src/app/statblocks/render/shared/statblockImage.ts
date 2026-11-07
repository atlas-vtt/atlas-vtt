import { normalizePath, type App, type TFile } from 'obsidian';
import { AssetService, type TokenAsset } from '../../../services/AssetService';

const WIKI_BRACKETS = /(^!?\[\[|\]\]$)/g;
const WEB_ADDRESS = /^https?:/;

/** A value with a stray `%` is not percent-encoded; it is read as written. */
function decoded(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The address a statblock's image value can be shown from: a web address as
 * it is, a vault path or wiki link (`[[Wolf.png|alias]]`) through the vault,
 * or '' where the vault holds no such file. Without an app the value is
 * returned as written.
 */
export function statblockImageSrc(app: App | undefined, raw: string, sourcePath: string | undefined): string {
  if (!raw) return '';
  const src = linkTarget(raw);
  if (WEB_ADDRESS.test(src) || !app) return src;
  const file = statblockImageFile(app, raw, sourcePath);
  return file ? app.vault.getResourcePath(file) : '';
}

/** What a value names: a path or a wiki link's target, without its alias. */
function linkTarget(raw: string): string {
  return decoded(raw).replace(WIKI_BRACKETS, '').split('|')[0] ?? '';
}

/**
 * The vault paths an image value may name, in the order they are tried: as written, then without a
 * heading, then both percent-decoded; each without a wiki link's brackets and alias and without
 * leading slashes. TTRPG Convert CLI writes `/2.%20Mechanics/token.png`, whose encoded spaces
 * Obsidian's link resolver does not read (Fantasy Statblocks decodes them before it resolves).
 */
function vaultTargets(raw: string): string[] {
  const written = raw.trim().replace(WIKI_BRACKETS, '').split('|')[0] ?? '';
  const paths = [written, decoded(written)].flatMap((path) => [path, path.split('#')[0] ?? '']);
  return [...new Set(paths.map((path) => path.trim().replace(/^\/+/, '')))].filter((path) => path !== '');
}

/** The vault file a statblock's image value names: a link from `sourcePath`, else a vault path; null for none, a missing file or a web address. */
export function statblockImageFile(app: App, raw: string, sourcePath: string | undefined): TFile | null {
  if (!raw || WEB_ADDRESS.test(linkTarget(raw))) return null;
  for (const path of vaultTargets(raw)) {
    const file = app.metadataCache.getFirstLinkpathDest(path, sourcePath ?? '') ?? app.vault.getFileByPath(normalizePath(path));
    if (file) return file;
  }
  return null;
}

/** The token asset whose art the statblock's image is: its ring is the one the statblock shows. */
export function statblockImageToken(app: App, raw: string, sourcePath: string | undefined): TokenAsset | null {
  const file = statblockImageFile(app, raw, sourcePath);
  return file ? AssetService.getInstance(app).findTokenAssetByImagePath(file.path) : null;
}

/** A linked token's art as a card shows it in place of a picture the note cannot show. */
export interface LinkedTokenArt {
  src: string;
  token: TokenAsset;
}

/**
 * The art of the first library token linked to the statblock whose image the
 * vault holds (index order, as the link service picks the picture): what a
 * card shows where the note names no picture, or one the vault no longer
 * holds. Null before the asset index is read.
 */
export function linkedTokenArt(app: App, statblockPath: string | undefined): LinkedTokenArt | null {
  if (!statblockPath) return null;
  for (const token of AssetService.getInstance(app).loadedTokenAssets()) {
    if (token.statblockPath !== statblockPath || !token.imagePath) continue;
    const file = app.vault.getFileByPath(token.imagePath);
    if (file) return { src: app.vault.getResourcePath(file), token };
  }
  return null;
}
