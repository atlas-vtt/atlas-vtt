import { useMemo } from 'react';
import { TFile, type App } from 'obsidian';
import type { TokenVitals } from '../../../services/statblockVitalsSync';

/** A token's art as a statblock shows it in place of the statblock's own image. */
export interface StatblockPortrait {
  src: string;
  ringColor?: string | undefined;
  showRing?: boolean | undefined;
}

/**
 * The art of `tokens`, resolved to a URL: a statblock shown for a token shows
 * the token's art, so the creature never looks different from the token on the
 * map. Tokens of different art (variants sharing the statblock) leave the
 * note's own picture.
 */
export function useTokenPortrait(app: App, tokens: readonly TokenVitals[]): StatblockPortrait | undefined {
  const arts = new Set(tokens.flatMap((candidate) => (candidate.imagePath ? [candidate.imagePath] : [])));
  const token = arts.size === 1 ? tokens.find((candidate) => candidate.imagePath) : undefined;
  const path = token?.imagePath;
  const ringColor = token?.ringColor;
  const showRing = token?.showRing;

  return useMemo((): StatblockPortrait | undefined => {
    if (!path) return undefined;
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return undefined;
    return { src: app.vault.getResourcePath(file), ringColor, showRing };
  }, [app, path, ringColor, showRing]);
}
