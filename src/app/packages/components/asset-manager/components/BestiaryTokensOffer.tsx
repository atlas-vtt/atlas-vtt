import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../primitives/button';
import { LoadingSpinner } from '../../primitives/LoadingSpinner';
import { ProgressBar } from '../../primitives/ProgressBar';
import { t } from '../../../../i18n';
import type { AssetService } from '../../../../services/AssetService';
import { BESTIARY_BYTES, BESTIARY_TOKEN_COUNT, hasBestiaryTokens, installBestiaryTokens } from '../../../../services/stockPacks/bestiaryTokens';
import type { StatblockSet } from '../../../../services/stockPacks/starterStatblocks';
import { builtInPresetId } from '../../../../gameSystems/presets/presetHelpers';
import { showNotice } from '../../../../ui/notice';
import { StarterTokensChoice, type StarterChoice } from './StarterTokensChoice';

const FAILED_NOTICE_MS = 12_000;

type DownloadPhase = { phase: 'idle' } | { phase: 'downloading'; collection: string; share: number };

interface DownloadState {
  current: DownloadPhase;
  listeners: Set<() => void>;
}

// One download per library at a time, whichever asset manager started it: the map view's and the global one show the same.
const downloads = new WeakMap<AssetService, DownloadState>();

function stateOf(assets: AssetService): DownloadState {
  let state = downloads.get(assets);
  if (!state) {
    state = { current: { phase: 'idle' }, listeners: new Set() };
    downloads.set(assets, state);
  }
  return state;
}

function announce(state: DownloadState, next: DownloadPhase): void {
  state.current = next;
  for (const listener of state.listeners) listener();
}

function startDownload(app: App, assets: AssetService, collection: string, statblocks: StatblockSet | undefined): void {
  const state = stateOf(assets);
  if (state.current.phase === 'downloading') return;
  announce(state, { phase: 'downloading', collection, share: 0 });
  installBestiaryTokens(app, assets, collection, { ...(statblocks && { statblocks }), onStep: (share) => announce(state, { phase: 'downloading', collection, share }) }).then(
    (count) => {
      announce(state, { phase: 'idle' });
      showNotice(t('am.bestiary.added', { count, collection }));
    },
    (error: unknown) => {
      console.error('[Atlas] Could not download the starter tokens', error);
      announce(state, { phase: 'idle' });
      showNotice(t('am.bestiary.failed'), FAILED_NOTICE_MS);
    },
  );
}

function useDownload(assets: AssetService): DownloadPhase {
  const state = stateOf(assets);
  return useSyncExternalStore((listener) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }, () => state.current);
}

/** Whether the collection holds the pack; null until known. Read again whenever the library changes. */
function usePackPresent(app: App, assets: AssetService, collection: string, download: DownloadPhase): boolean | null {
  const [present, setPresent] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    const read = (): void => {
      hasBestiaryTokens(assets, collection).then((found) => {
        if (current) setPresent(found);
      }, () => {
        if (current) setPresent(null);
      });
    };
    read();
    const ref = app.workspace.on('atlas-vtt:refresh-assets', read);
    return () => {
      current = false;
      app.workspace.offref(ref);
    };
  }, [app, assets, collection, download.phase]);
  return present;
}

/** What a collection's game system suggests: its own statblocks where the pack has them. */
function suggestedChoice(assets: AssetService, collection: string): StarterChoice {
  const preset = assets.getCollectionSettings(collection).systemPresetId;
  if (preset === builtInPresetId('dnd5e')) return '5e';
  if (preset === builtInPresetId('cairn')) return 'cairn';
  return 'none';
}

/** Closes the choice on a press outside the button and its popover, in the document they are in. */
function useCloseOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!open || !doc) return undefined;
    const press = (event: MouseEvent | TouchEvent): void => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      close();
    };
    doc.addEventListener('mousedown', press);
    doc.addEventListener('touchstart', press);
    return () => {
      doc.removeEventListener('mousedown', press);
      doc.removeEventListener('touchstart', press);
    };
  }, [ref, open, close]);
}

/**
 * Offers the starter tokens until the open collection holds them. The button opens a popover
 * that asks which statblocks they come with, and its Download starts; while they download into
 * this collection, a spinner and a bar say so. `empty` is the empty Tokens tab's call to action,
 * `sidebar` the quiet one at the sidebar's foot for a collection that holds other tokens.
 */
export function BestiaryTokensOffer({ app, assets, collection, variant, fallback = null }: {
  app: App;
  assets: AssetService;
  collection: string;
  variant: 'empty' | 'sidebar';
  /** Shown in the offer's place once the collection holds the pack (the empty state's own hint). */
  fallback?: React.ReactNode;
}): React.JSX.Element | null {
  const download = useDownload(assets);
  const present = usePackPresent(app, assets, collection, download);
  const [choice, setChoice] = useState<StarterChoice>(() => suggestedChoice(assets, collection));
  const [choosing, setChoosing] = useState(false);
  const [fromKeys, setFromKeys] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const close = useCallback((): void => setChoosing(false), []);
  useCloseOutside(anchor, choosing, close);
  useEffect(() => {
    setChoice(suggestedChoice(assets, collection));
    setChoosing(false);
  }, [assets, collection]);
  // Downloading into this collection; one into another holds the button until it is done.
  const downloading = download.phase === 'downloading' && download.collection === collection;
  const busy = download.phase === 'downloading';
  if (!downloading && present !== false) return <>{fallback}</>;
  const size = Math.round(BESTIARY_BYTES / 1_000_000);
  // The button keeps one label while it downloads, so it never changes size; the bar below says how far it got.
  const label = downloading ? t('am.bestiary.downloading') : t(variant === 'empty' ? 'am.bestiary.offer' : 'am.bestiary.get', { count: BESTIARY_TOKEN_COUNT });
  const percent = download.phase === 'downloading' ? Math.floor(download.share * 100) : 0;
  const progress = downloading && (
    <ProgressBar className="atlas-bestiary-offer__progress" value={percent} max={100} label={t('am.bestiary.downloading')} valueText={`${percent}%`} />
  );
  const start = (): void => {
    setChoosing(false);
    startDownload(app, assets, collection, choice === 'none' ? undefined : choice);
  };
  const button = (
    <div ref={anchor} className="atlas-dropdown-menu atlas-starter-anchor">
      <Button
        variant={variant === 'empty' ? 'default' : 'ghost'}
        className={variant === 'empty' ? 'atlas-bestiary-offer atlas-bestiary-offer--empty' : 'atlas-asset-manager-manage-btn atlas-bestiary-offer atlas-bestiary-offer--sidebar'}
        disabled={busy}
        aria-busy={downloading}
        aria-haspopup="dialog"
        aria-expanded={choosing}
        aria-label={downloading ? undefined : t('am.bestiary.label', { count: BESTIARY_TOKEN_COUNT, size })}
        onClick={(event) => {
          event.stopPropagation();
          // A click the keyboard made has no pointer behind it.
          setFromKeys(event.detail === 0);
          setChoosing((open) => !open);
        }}
      >
        {downloading ? <LoadingSpinner size={14} /> : <Download />}
        <span>{label}</span>
        {variant === 'sidebar' && !downloading && <small>{t('am.bestiary.size', { size })}</small>}
      </Button>
      {choosing && !busy && (
        <StarterTokensChoice choice={choice} onChoose={setChoice} onDownload={start} onClose={close} placement={variant === 'empty' ? 'bottom' : 'top'} size={size} focusChoice={fromKeys} />
      )}
    </div>
  );
  if (variant === 'sidebar') {
    return <div className="atlas-bestiary-offer-block atlas-bestiary-offer-block--sidebar">{button}{progress}</div>;
  }
  return (
    <div className="atlas-starter-offer">
      <p>{t('am.bestiary.lead')}</p>
      <div className="atlas-starter-offer__panel">
        {button}
        {progress}
      </div>
      <p className="atlas-starter-offer__fine">{t('am.bestiary.fine', { size })}</p>
    </div>
  );
}
