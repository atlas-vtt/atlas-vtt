import React, { useEffect, useMemo, useState } from 'react';
import type { App, TFile } from 'obsidian';
import { VaultImageGrid } from '../../../packages/components/asset-manager/vault-images/VaultImageGrid';
import { VaultImageThumbnails } from '../../../packages/components/asset-manager/vault-images/vaultImageThumbnails';
import { matchingVaultImages, vaultImages } from '../../../packages/components/asset-manager/vault-images/vaultImageFiles';
import { t } from '../../../i18n';
import { TokenChoiceGrid } from './TokenChoiceGrid';
import type { CardToken, NoteTokens } from './useNoteTokens';

/** What the panel chooses from: the collection's tokens, or any image of the vault. */
export type ArtSource = 'tokens' | 'vault';

/** Vault image cards in the panel: narrower than the asset manager's, four to a row. */
const VAULT_CARD_MIN_WIDTH = 96;

interface VaultChoicesProps {
  app: App;
  query: string;
  chosen: string | null;
  busy: boolean;
  scrollElement: HTMLElement | null;
  onChoose: (file: TFile) => void;
}

/** The vault's images as the creators show them; their thumbnails are made only while this tab is open. */
function VaultChoices({ app, query, chosen, busy, scrollElement, onChoose }: VaultChoicesProps): React.JSX.Element {
  const files = useMemo(() => vaultImages(app), [app]);
  const thumbnails = useMemo(() => new VaultImageThumbnails(app), [app]);
  useEffect(() => () => thumbnails.dispose(), [thumbnails]);
  const shown = useMemo(() => matchingVaultImages(files, query), [files, query]);
  if (shown.length === 0) {
    return <p className="atlas-sb-token-panel__empty">{query.trim() ? t('vaultImages.noMatch') : t('vaultImages.noneFound')}</p>;
  }
  return (
    <VaultImageGrid
      files={shown}
      thumbnails={thumbnails}
      pick={{ kind: 'one', chosen, onChoose }}
      disabled={busy}
      scrollElement={scrollElement}
      minCardWidth={VAULT_CARD_MIN_WIDTH}
    />
  );
}

export interface TokenArtChoicesProps {
  app: App;
  source: ArtSource;
  tokens: NoteTokens;
  linkedIds: ReadonlySet<string>;
  query: string;
  busy: boolean;
  /** The vault image the note's art is now; null for none or another's. */
  chosenImage: string | null;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onChooseToken: (token: CardToken) => void;
  onChooseImage: (file: TFile) => void;
}

/**
 * The tab the panel shows, in one scrolling well of a fixed height, so that
 * switching tabs or searching never changes the panel's size.
 */
export function TokenArtChoices(props: TokenArtChoicesProps): React.JSX.Element {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setScrollElement} className="atlas-sb-token-panel__choices" data-source={props.source}>
      {props.source === 'tokens'
        ? (
          <TokenChoiceGrid
            tokens={props.tokens.choices}
            linkedIds={props.linkedIds}
            loaded={props.tokens.loaded}
            busy={props.busy}
            onChoose={props.onChooseToken}
            query={props.query}
            searchRef={props.searchRef}
          />
        )
        : (
          <VaultChoices
            app={props.app}
            query={props.query}
            chosen={props.chosenImage}
            busy={props.busy}
            scrollElement={scrollElement}
            onChoose={props.onChooseImage}
          />
        )}
    </div>
  );
}
