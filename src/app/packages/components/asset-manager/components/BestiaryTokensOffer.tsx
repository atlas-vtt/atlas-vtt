import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../primitives/button';
import { SegmentedControl, type SegmentedOption } from '../../primitives/SegmentedControl';
import { t } from '../../../../i18n';
import type { AssetService } from '../../../../services/AssetService';
import { BESTIARY_BYTES, BESTIARY_TOKEN_COUNT, hasBestiaryTokens, installBestiaryTokens } from '../../../../services/stockPacks/bestiaryTokens';
import { STATBLOCK_COUNTS, type StatblockSet } from '../../../../services/stockPacks/starterStatblocks';
import { builtInPresetId } from '../../../../gameSystems/presets/presetHelpers';
import { showNotice } from '../../../../ui/notice';

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

type Choice = StatblockSet | 'none';

const CHOICES: readonly SegmentedOption<Choice>[] = [
  { value: 'none', label: t('am.bestiary.none') },
  { value: '5e', label: t('am.bestiary.fiveE') },
  { value: 'cairn', label: t('am.bestiary.cairn') },
];

/** What a collection's game system suggests: its own statblocks where the pack has them. */
function suggestedChoice(assets: AssetService, collection: string): Choice {
  const preset = assets.getCollectionSettings(collection).systemPresetId;
  if (preset === builtInPresetId('dnd5e')) return '5e';
  if (preset === builtInPresetId('cairn')) return 'cairn';
  return 'none';
}

function noteOf(choice: Choice, size: number): string {
  if (choice === 'none') return t('am.bestiary.note', { size });
  return t(choice === '5e' ? 'am.bestiary.noteFiveE' : 'am.bestiary.noteCairn', { count: STATBLOCK_COUNTS[choice], size });
}

/**
 * Offers the starter tokens until the open collection holds them, with the statblocks the user
 * picks; while they download into it, says how far it got. `empty` is the empty Tokens tab's call
 * to action, `sidebar` the quiet one at the sidebar's foot for a collection that holds other tokens.
 */
export function BestiaryTokensOffer({ app, assets, collection, variant }: { app: App; assets: AssetService; collection: string; variant: 'empty' | 'sidebar' }): React.JSX.Element | null {
  const download = useDownload(assets);
  const present = usePackPresent(app, assets, collection, download);
  const [choice, setChoice] = useState<Choice>(() => suggestedChoice(assets, collection));
  useEffect(() => setChoice(suggestedChoice(assets, collection)), [assets, collection]);
  // Downloading into this collection; one into another holds the button until it is done.
  const downloading = download.phase === 'downloading' && download.collection === collection;
  const busy = download.phase === 'downloading';
  if (!downloading && present !== false) return null;
  const size = Math.round(BESTIARY_BYTES / 1_000_000);
  const label = downloading
    ? t('am.bestiary.downloading', { percent: Math.floor(download.share * 100) })
    : t(variant === 'empty' ? 'am.bestiary.offer' : 'am.bestiary.get', { count: BESTIARY_TOKEN_COUNT });
  return (
    <div className={variant === 'empty' ? 'atlas-bestiary-offer-block' : 'atlas-bestiary-offer-block atlas-bestiary-offer-block--sidebar'}>
      <div className="atlas-bestiary-offer__choice">
        <span aria-hidden="true">{t('am.bestiary.statblocks')}</span>
        <SegmentedControl value={choice} options={CHOICES} onChange={setChoice} ariaLabel={t('am.bestiary.statblocks')} disabled={busy} />
      </div>
      <Button
        variant={variant === 'empty' ? 'default' : 'ghost'}
        className={variant === 'empty' ? 'atlas-bestiary-offer atlas-bestiary-offer--empty' : 'atlas-asset-manager-manage-btn atlas-bestiary-offer atlas-bestiary-offer--sidebar'}
        disabled={busy}
        aria-busy={downloading}
        aria-label={downloading ? undefined : t('am.bestiary.label', { count: BESTIARY_TOKEN_COUNT, size })}
        onClick={(event) => {
          event.stopPropagation();
          startDownload(app, assets, collection, choice === 'none' ? undefined : choice);
        }}
      >
        <Download />
        <span>{label}</span>
        {variant === 'sidebar' && !downloading && <small>{t('am.bestiary.size', { size })}</small>}
      </Button>
      {variant === 'empty' && <p>{noteOf(choice, size)}</p>}
    </div>
  );
}
