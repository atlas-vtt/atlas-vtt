import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../primitives/button';
import { t } from '../../../../i18n';
import type { AssetService } from '../../../../services/AssetService';
import { BESTIARY_BYTES, BESTIARY_TOKEN_COUNT, hasBestiaryTokens, installBestiaryTokens } from '../../../../services/stockPacks/bestiaryTokens';
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

function startDownload(app: App, assets: AssetService, collection: string): void {
  const state = stateOf(assets);
  if (state.current.phase === 'downloading') return;
  announce(state, { phase: 'downloading', collection, share: 0 });
  installBestiaryTokens(app, assets, collection, { onStep: (share) => announce(state, { phase: 'downloading', collection, share }) }).then(
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

/**
 * Offers the starter tokens until the open collection holds them; while they download into it, says
 * how far it got. `empty` is the empty Tokens tab's call to action, `sidebar` the quiet one at the
 * sidebar's foot for a collection that holds other tokens.
 */
export function BestiaryTokensOffer({ app, assets, collection, variant }: { app: App; assets: AssetService; collection: string; variant: 'empty' | 'sidebar' }): React.JSX.Element | null {
  const download = useDownload(assets);
  const present = usePackPresent(app, assets, collection, download);
  // Downloading into this collection; one into another holds the button until it is done.
  const downloading = download.phase === 'downloading' && download.collection === collection;
  const busy = download.phase === 'downloading';
  if (!downloading && present !== false) return null;
  const size = Math.round(BESTIARY_BYTES / 1_000_000);
  const label = downloading
    ? t('am.bestiary.downloading', { percent: Math.floor(download.share * 100) })
    : t(variant === 'empty' ? 'am.bestiary.offer' : 'am.bestiary.get', { count: BESTIARY_TOKEN_COUNT });
  const button = (
    <Button
      variant={variant === 'empty' ? 'default' : 'ghost'}
      className={variant === 'empty' ? 'atlas-bestiary-offer atlas-bestiary-offer--empty' : 'atlas-asset-manager-manage-btn atlas-bestiary-offer atlas-bestiary-offer--sidebar'}
      disabled={busy}
      aria-busy={downloading}
      aria-label={downloading ? undefined : t('am.bestiary.label', { count: BESTIARY_TOKEN_COUNT, size })}
      onClick={(event) => {
        event.stopPropagation();
        startDownload(app, assets, collection);
      }}
    >
      <Download />
      <span>{label}</span>
      {variant === 'sidebar' && !downloading && <small>{t('am.bestiary.size', { size })}</small>}
    </Button>
  );
  if (variant === 'sidebar') return button;
  return (
    <div className="atlas-bestiary-offer-block">
      {button}
      <p>{t('am.bestiary.note', { size })}</p>
    </div>
  );
}
