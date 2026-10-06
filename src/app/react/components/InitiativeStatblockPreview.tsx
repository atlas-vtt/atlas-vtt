import React from 'react';
import type { App } from 'obsidian';
import type { TokenEntity } from '../../types';
import type { TokenRollContext } from '../../types/diceRollOrigin';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { StatblockHoverPreview, type StatblockHoverPreviewState } from './StatblockHoverPreview';

/** An initiative entry whose statblock is previewed. */
export interface PreviewedEntry {
  entry: InitiativeEntry;
  /** The view, scene and token of the list the entry was hovered in; the preview keeps it while it stays open. */
  originContext: TokenRollContext | undefined;
}

interface InitiativeStatblockPreviewProps {
  app: App | null;
  state: StatblockHoverPreviewState<PreviewedEntry>;
  tokens: Record<string, TokenEntity>;
}

/** The statblock of the hovered combatant, beside the tracker. */
export function InitiativeStatblockPreview({ app, state, tokens }: InitiativeStatblockPreviewProps): React.ReactElement {
  const hovered = state.hoveredEntry;
  const token = hovered ? tokens[hovered.entry.tokenId] : undefined;
  return (
    // Key forces remount on entry change to trigger animation
    <StatblockHoverPreview
      key={hovered?.entry.id || 'none'}
      notePath={state.notePath}
      app={app}
      vitals={
        hovered && {
          ...hovered.entry,
          // Rolls from the preview act on the token, not on the initiative entry.
          id: hovered.entry.tokenId,
          resources: token?.resources,
          ringColor: token?.ringColor,
          showRing: token?.showRing,
        }
      }
      originContext={hovered?.originContext}
      isVisible={state.isVisible}
      isClosing={state.isClosing}
      position={state.position}
      anchorRect={state.anchorRect}
      preferredSide="left"
    />
  );
}
