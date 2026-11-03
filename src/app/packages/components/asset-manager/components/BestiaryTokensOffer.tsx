import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../primitives/button';
import { t } from '../../../../i18n';
import type { AssetService } from '../../../../services/AssetService';
import { BESTIARY_BYTES, BESTIARY_TAG, BESTIARY_TOKEN_COUNT, hasBestiaryTokens, installBestiaryTokens } from '../../../../services/stockPacks/bestiaryTokens';
import { showNotice } from '../../../../ui/notice';

const FAILED_NOTICE_MS = 12_000;

type DownloadPhase = { phase: 'idle' } | { phase: 'downloading'; share: number };

interface DownloadState {
  current: DownloadPhase;
  listeners: Set<() => void>;
}

// One download per library, whichever asset manager started it: the map view's and the global one show the same.
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

function startDownload(app: App, assets: AssetService): void {
  const state = stateOf(assets);
  if (state.current.phase === 'downloading') return;
  announce(state, { phase: 'downloading', share: 0 });
  installBestiaryTokens(app, assets, { onStep: (share) => announce(state, { phase: 'downloading', share }) }).then(
    (count) => {
      announce(state, { phase: 'idle' });
      showNotice(t('am.bestiary.added', { count, tag: BESTIARY_TAG }));
    },
    (error: unknown) => {
      console.error('[Atlas] Could not download the bestiary tokens', error);
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

/** Whether the library holds the pack; null until known. Read again whenever the library changes. */
function usePackPresent(app: App, assets: AssetService, download: DownloadPhase): boolean | null {
  const [present, setPresent] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    const read = (): void => {
      hasBestiaryTokens(assets).then((found) => {
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
  }, [app, assets, download.phase]);
  return present;
}

/** Offers the bestiary tokens until the library holds them; while they download, says how far it got. */
export function BestiaryTokensOffer({ app, assets }: { app: App; assets: AssetService }): React.JSX.Element | null {
  const download = useDownload(assets);
  const present = usePackPresent(app, assets, download);
  const downloading = download.phase === 'downloading';
  if (!downloading && present !== false) return null;
  const size = Math.round(BESTIARY_BYTES / 1_000_000);
  return (
    <Button
      variant="ghost"
      className="atlas-asset-manager-manage-btn atlas-bestiary-offer"
      disabled={downloading}
      aria-busy={downloading}
      aria-label={downloading ? undefined : t('am.bestiary.label', { count: BESTIARY_TOKEN_COUNT, size })}
      onClick={(event) => {
        event.stopPropagation();
        startDownload(app, assets);
      }}
    >
      <Download />
      {downloading
        ? <span>{t('am.bestiary.downloading', { percent: Math.floor(download.share * 100) })}</span>
        : <><span>{t('am.bestiary.get')}</span><small>{t('am.bestiary.size', { size })}</small></>}
    </Button>
  );
}
