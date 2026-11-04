import React, { useId, useMemo, useRef, useState } from 'react';
import type { TFile } from 'obsidian';
import { Sparkles, Unlink } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { DropdownToggleRow } from '../../../packages/components/primitives/DropdownToggleRow';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { t } from '../../../i18n';
import type { TemplateField } from '../../model/templateTypes';
import type { PaneEditController } from '../statblock-pane/paneEditContext';
import { TokenArtChoices, type ArtSource } from './TokenArtChoices';
import { artFile, artSrc, isTheArt, linkToken, makeToken, setArt, setRing, shownArt, unlinkToken } from './tokenSocketActions';
import { useNoteTokens, type CardToken } from './useNoteTokens';

export interface TokenLinkPanelProps {
  pane: PaneEditController;
  /** The Image block's field: the note's art. */
  field: TemplateField;
  collectionId: string | null;
  /** Closes the panel; `refocus` gives focus back to the socket. */
  onClose: (refocus: boolean) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

const SOURCES: readonly SegmentedOption<ArtSource>[] = [
  { value: 'tokens', label: t('statblockEditor.token.tokens') },
  { value: 'vault', label: t('vaultImages.list') },
];

/** The first choice of the open tab, which Down from the search reaches. */
const FIRST_CHOICE = '.atlas-sb-token-choice[tabindex="0"], .atlas-vault-images__card';

/**
 * What the token socket opens: the tokens linked to the statblock, each
 * unlinkable and the one whose art the note shows marked; one search with the
 * Ring switch beside it; and a tab of the collection's tokens to link or of
 * the vault's images to take as the note's art.
 */
export function TokenLinkPanel({ pane, field, collectionId, onClose, searchRef }: TokenLinkPanelProps): React.JSX.Element {
  const { app } = pane;
  const tokens = useNoteTokens(app, pane.notePath, collectionId, true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<ArtSource>('tokens');
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const art = artSrc(pane, field);
  const shown = shownArt(pane, field);
  const linkedIds = useMemo(() => new Set(tokens.linked.map((token) => token.id)), [tokens.linked]);
  const artImage = artFile(pane, field);
  const framed = shown.token;
  const canMake = tokens.loaded && tokens.linked.length === 0 && artImage !== null && collectionId !== null;
  const vault = source === 'vault';

  /** Runs one action at a time; a status says what it does meanwhile. */
  const run = (label: string, action: () => Promise<unknown>, after?: () => void): void => {
    if (busy) return;
    setBusy(label);
    void action()
      .catch((error: unknown) => console.error(`[Atlas] ${label} failed:`, error))
      .finally(() => {
        setBusy(null);
        after?.();
        // The control pressed may be gone ("Use its art" turns into the badge): focus stays in the panel.
        const panel = panelRef.current;
        panel?.win.requestAnimationFrame(() => {
          if (panel.isConnected && !panel.contains(panel.doc.activeElement)) panel.focus({ preventScroll: true });
        });
      });
  };

  const choose = (token: CardToken): void => run('Linking', async () => {
    if (await linkToken(pane, field, token)) pane.announce(t('statblockEditor.token.linked', { name: token.name }));
  }, () => onClose(true));

  const chooseImage = (file: TFile): void => run('Setting the art', () => setArt(pane, field, file.path), () => onClose(true));

  const unlink = (token: CardToken): void => run('Unlinking', async () => {
    if (await unlinkToken(app, token)) pane.announce(t('statblockEditor.token.unlinked', { name: token.name }));
  });

  const showArtOf = (token: CardToken): void => run('Setting the art', async () => {
    if (token.imagePath) await setArt(pane, field, token.imagePath);
  });

  const toggleRing = (): void => {
    if (framed) run('Setting the ring', () => setRing(pane, framed, framed.showRing === false));
  };

  const create = (): void => {
    if (collectionId) run('Creating a token', () => makeToken(pane, collectionId));
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    // Escape empties a search first; once empty, it closes the panel.
    if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      event.stopPropagation();
      setQuery('');
      return;
    }
    if (event.key !== 'ArrowDown') return;
    const first = panelRef.current?.querySelector<HTMLElement>(FIRST_CHOICE);
    if (!first) return;
    event.preventDefault();
    first.focus();
  };

  return (
    <div ref={panelRef} className="atlas-sb-token-panel" role="dialog" aria-labelledby={titleId} aria-busy={busy !== null} tabIndex={-1}>
      <div className="atlas-sb-token-panel__header">
        <h3 id={titleId} className="atlas-sb-token-panel__title">{t('statblockEditor.token.art')}</h3>
        <CloseButton onClick={() => onClose(true)} />
      </div>
      <div className="atlas-sb-token-panel__body">
        {tokens.linked.length > 0 && (
          <ul className="atlas-sb-token-panel__linked" aria-label={t('statblockEditor.token.linkedList')}>
            {tokens.linked.map((token) => (
              <li key={token.id} className="atlas-sb-token-panel__row">
                <TokenPortrait
                  className="atlas-sb-token-panel__portrait"
                  src={token.thumbnailUrl || token.imageUrl}
                  alt=""
                  showRing={token.showRing !== false}
                  pending={token.thumbnailPending}
                />
                <span className="atlas-sb-token-panel__name">{token.name}</span>
                {isTheArt(app, token, art)
                  ? <span className="atlas-sb-token-panel__badge">{t('statblockEditor.token.statblockImage')}</span>
                  : <Button type="button" variant="ghost" size="sm" aria-disabled={busy !== null || undefined} onClick={() => showArtOf(token)}>{t('statblockEditor.token.useArt')}</Button>}
                <LabelTooltip label={t('statblockEditor.token.unlinkNamed', { name: token.name })}>
                  <Button type="button" variant="ghost" size="icon" className="atlas-sb-token-panel__unlink" aria-disabled={busy !== null || undefined} onClick={() => unlink(token)}>
                    <Unlink aria-hidden="true" />
                  </Button>
                </LabelTooltip>
              </li>
            ))}
          </ul>
        )}
        {canMake && (
          <Button type="button" variant="ghost" size="sm" className="atlas-sb-token-panel__make" aria-disabled={busy !== null || undefined} onClick={create}>
            <Sparkles aria-hidden="true" />
            {t('statblockEditor.token.createFromArt')}
          </Button>
        )}
        <div className="atlas-sb-token-panel__controls">
          <input
            ref={searchRef}
            type="text"
            className="atlas-sb-token-panel__search"
            placeholder={vault ? t('vaultImages.searchPlaceholder') : t('statblockEditor.token.search')}
            aria-label={vault ? t('vaultImages.search') : t('statblockEditor.token.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
          />
          {/* Kept when the art is no token's, so the row keeps its shape. */}
          <DropdownToggleRow
            label={t('statblockEditor.token.ring')}
            value={framed !== null && framed.showRing !== false}
            onChange={toggleRing}
            disabled={framed === null || busy !== null}
            disabledReason={framed ? undefined : shown.src ? 'This art belongs to no token' : 'Add token art first'}
          />
        </div>
        <SegmentedControl className="atlas-sb-token-panel__sources" value={source} options={SOURCES} onChange={setSource} ariaLabel={t('statblockEditor.token.chooseFrom')} />
        <TokenArtChoices
          app={app}
          source={source}
          tokens={tokens}
          linkedIds={linkedIds}
          query={query}
          busy={busy !== null}
          chosenImage={artImage?.path ?? null}
          searchRef={searchRef}
          onChooseToken={choose}
          onChooseImage={chooseImage}
        />
      </div>
      <span className="atlas-sb-token-panel__hidden" role="status">{busy ? `${busy}…` : ''}</span>
    </div>
  );
}
