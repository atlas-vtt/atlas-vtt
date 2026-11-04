import { useState } from 'react';
import type { App as ObsidianApp } from 'obsidian';
import { TokenStatblockLinkService } from '../../../../services/TokenStatblockLinkService';
import type { AnyAsset, TokenAsset } from '../types';

export interface StatblockLinkState {
  linkingStatblockAsset: TokenAsset | null;
  openStatblockLinkModal: (asset: AnyAsset) => void;
  closeStatblockLinkModal: () => void;
  handleLinkStatblock: (statblockPath: string | null) => Promise<void>;
  unlinkStatblock: (asset: AnyAsset) => Promise<void>;
}

function tokenImagePathOf(asset: TokenAsset): string {
  return asset.imagePath ?? asset.imageUrl;
}

/**
 * Drives the "Link Statblock" flow for token assets in the asset manager.
 * All vault/metadata writes go through TokenStatblockLinkService so links
 * stay consistent with the token picker and the on-map context menu.
 */
export function useStatblockLink(app: ObsidianApp): StatblockLinkState {
  const [linkingStatblockAsset, setLinkingStatblockAsset] = useState<TokenAsset | null>(null);

  const openStatblockLinkModal = (asset: AnyAsset): void => {
    if (asset.type === 'tokens') setLinkingStatblockAsset(asset);
  };

  const closeStatblockLinkModal = (): void => setLinkingStatblockAsset(null);

  const unlinkStatblock = async (asset: AnyAsset): Promise<void> => {
    if (asset.type !== 'tokens') return;
    try {
      await TokenStatblockLinkService.getInstance(app)
        .unlinkToken(tokenImagePathOf(asset), { updateStatblockAvatar: true });
    } catch (error) {
      console.error('[AssetManager] Failed to unlink statblock:', error);
    }
  };

  const handleLinkStatblock = async (statblockPath: string | null): Promise<void> => {
    const asset = linkingStatblockAsset;
    if (!asset) return;
    if (!statblockPath) {
      await unlinkStatblock(asset);
      return;
    }
    try {
      await TokenStatblockLinkService.getInstance(app).linkTokenToStatblock(
        tokenImagePathOf(asset),
        statblockPath,
      );
    } catch (error) {
      console.error('[AssetManager] Failed to link statblock:', error);
    }
  };

  return {
    linkingStatblockAsset,
    openStatblockLinkModal,
    closeStatblockLinkModal,
    handleLinkStatblock,
    unlinkStatblock,
  };
}
