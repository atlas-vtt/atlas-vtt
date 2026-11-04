import { TFile, type App } from 'obsidian';
import type { PlacedFace } from './campaignParty';

/** The most tokens read from one scene file. */
const MAX_TOKENS = 2000;
const MAX_TEXT = 1000;
const COLOUR = /^#[0-9a-f]{3,8}$/i;

interface CachedTokens {
  mtime: number;
  size: number;
  tokens: readonly PlacedFace[];
}

const caches = new WeakMap<App, Map<string, CachedTokens>>();

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' && value.length <= MAX_TEXT ? value : undefined);

function readToken(value: unknown): PlacedFace[] {
  if (!isRecord(value)) return [];
  const imagePath = text(value.imagePath);
  if (imagePath === undefined) return [];
  const assetId = text(value.assetId);
  const ringColor = typeof value.ringColor === 'string' && COLOUR.test(value.ringColor) ? value.ringColor : undefined;
  return [{ imagePath, ...(assetId !== undefined && { assetId }), ...(ringColor !== undefined && { ringColor }) }];
}

/** The tokens a scene file places, as far as faces need them; none for a file that cannot be read. */
export function placedTokensIn(content: string): PlacedFace[] {
  try {
    const file: unknown = JSON.parse(content);
    const state = isRecord(file) && isRecord(file.state) ? file.state : undefined;
    const objects = state && isRecord(state.objects) ? state.objects : undefined;
    const tokens = objects && isRecord(objects.tokens) ? objects.tokens : undefined;
    return tokens ? Object.values(tokens).slice(0, MAX_TOKENS).flatMap(readToken) : [];
  } catch {
    return [];
  }
}

/**
 * The tokens placed on the scene stored at `path`, as its file holds them; null when there is no
 * such file. A file is read again only once it changed (its time or size).
 */
export async function scenePlacedTokens(app: App, path: string): Promise<readonly PlacedFace[] | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  let cache = caches.get(app);
  if (!cache) {
    cache = new Map<string, CachedTokens>();
    caches.set(app, cache);
  }
  const { mtime, size } = file.stat;
  const cached = cache.get(path);
  if (cached && cached.mtime === mtime && cached.size === size) return cached.tokens;
  const tokens = placedTokensIn(await app.vault.cachedRead(file));
  // A read that finished after a read of a later version keeps the later one.
  const latest = cache.get(path);
  if (!latest || latest.mtime <= mtime) cache.set(path, { mtime, size, tokens });
  return tokens;
}
