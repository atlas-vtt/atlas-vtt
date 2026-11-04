import { useEffect, useReducer, useState } from 'react';
import type { App } from 'obsidian';
import type { AnyAsset, TokenAsset as CardToken } from '../../../packages/components/asset-manager/types';
import { formatServiceAsset, withThumbnails } from '../../../packages/components/asset-manager/utils/assetFormatters';
import { AssetService, type TokenAsset } from '../../../services/AssetService';
import { AssetThumbnailService, type ThumbnailUpdate } from '../../../services/AssetThumbnailService';

export type { CardToken };

export interface NoteTokens {
  /** The tokens linked to the note, from any collection. */
  linked: readonly CardToken[];
  /** The collection's tokens, by name: what the note can be linked to. */
  choices: readonly CardToken[];
  /** False until the asset index has been read. */
  loaded: boolean;
}

const NONE: NoteTokens = { linked: [], choices: [], loaded: false };

function byName(a: TokenAsset, b: TokenAsset): number {
  return a.name.localeCompare(b.name);
}

function isCard(asset: AnyAsset): asset is CardToken {
  return asset.type === 'tokens';
}

function cardsOf(app: App, assets: readonly TokenAsset[], thumbnails: AssetThumbnailService): CardToken[] {
  return assets.map((asset) => formatServiceAsset(asset, '', app, undefined, (art) => thumbnails.stateOf(art))).filter(isCard);
}

/** The cards with the thumbnails that were just made; the same list when none of them was waiting. */
function patched(cards: readonly CardToken[], updates: readonly ThumbnailUpdate[], app: App): readonly CardToken[] {
  const next = withThumbnails([...cards], updates, app);
  return next.every((card, index) => card === cards[index]) ? cards : next.filter(isCard);
}

/**
 * The tokens the socket's panel lists, as the asset manager's cards see them
 * (`formatServiceAsset`: thumbnails, and a placeholder while one is made).
 * Read while `active`, and again whenever the asset index changes; finished
 * thumbnails arrive as patches.
 */
export function useNoteTokens(app: App, notePath: string, collectionId: string | null, active: boolean): NoteTokens {
  const [tokens, setTokens] = useState<NoteTokens>(NONE);
  const [revision, reload] = useReducer((count: number): number => count + 1, 0);

  useEffect(() => {
    if (!active) return undefined;
    const ref = app.workspace.on('atlas-vtt:refresh-assets', reload);
    const assets = AssetService.getInstance(app);
    const stopReconciled = assets.onReconciled(reload);
    const stopThumbnails = AssetThumbnailService.getInstance(app, assets).onUpdated((updates) => setTokens((previous) => ({
      ...previous,
      linked: patched(previous.linked, updates, app),
      choices: patched(previous.choices, updates, app),
    })));
    return () => {
      app.workspace.offref(ref);
      stopReconciled();
      stopThumbnails();
    };
  }, [app, active]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const assets = AssetService.getInstance(app);
    const thumbnails = AssetThumbnailService.getInstance(app, assets);
    void (async () => {
      try {
        await assets.initialize();
        const all = [...await assets.getTokenAssets()].sort(byName);
        const inCollection = all.filter((asset) => asset.collection === collectionId);
        thumbnails.ensureThumbnails(inCollection);
        if (cancelled) return;
        setTokens({
          linked: cardsOf(app, all.filter((asset) => asset.statblockPath === notePath), thumbnails),
          choices: cardsOf(app, inCollection, thumbnails),
          loaded: true,
        });
      } catch (error) {
        console.error('[Atlas] Reading the tokens for the statblock failed:', error);
        if (!cancelled) setTokens({ ...NONE, loaded: true });
      }
    })();
    return () => { cancelled = true; };
  }, [app, notePath, collectionId, active, revision]);

  return tokens;
}
