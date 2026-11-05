import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AlertTriangle } from 'lucide-react';
import { t } from '../../../../../i18n';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { hasStarterPack, installStarterPack, mayInstallStarterPack, STARTER_BYTES, STARTER_FOLDER, STARTER_SOUND_COUNT } from '../../../../../soundLibrary/starterPack';
import { showNotice } from '../../../../../ui/notice';
import { cn } from '../../../../../../utils/cn';
import { useLibraryVersion } from './useLibrary';
import type { LibraryActions } from './useLibraryActions';

/** A failed download: said on its own button, which offers it again. */
type Download = { phase: 'idle' } | { phase: 'downloading'; share: number } | { phase: 'failed' };

interface DownloadState {
  current: Download;
  listeners: Set<() => void>;
}

// One download per library, whichever page started it, so the DM screen and the Sound tab show the same one.
const downloads = new WeakMap<SoundLibrary, DownloadState>();

function stateOf(library: SoundLibrary): DownloadState {
  let state = downloads.get(library);
  if (!state) {
    state = { current: { phase: 'idle' }, listeners: new Set() };
    downloads.set(library, state);
  }
  return state;
}

function announce(state: DownloadState, next: Download): void {
  state.current = next;
  for (const listener of state.listeners) listener();
}

function startDownload(library: SoundLibrary, actions: LibraryActions): void {
  const state = stateOf(library);
  if (state.current.phase === 'downloading') return;
  announce(state, { phase: 'downloading', share: 0 });
  installStarterPack(library, { onStep: (share) => announce(state, { phase: 'downloading', share }) }).then(
    () => {
      announce(state, { phase: 'idle' });
      // Copies are made at first play otherwise, which keeps a press waiting for seconds.
      actions.prepare('ambience', STARTER_FOLDER);
      library.place.show('ambience', [STARTER_FOLDER]);
      showNotice(t('audio.library.starterAdded', { count: STARTER_SOUND_COUNT }));
    },
    (error: unknown) => {
      console.error('[Atlas] Could not download the starter ambience', error);
      announce(state, { phase: 'failed' });
    },
  );
}

function useDownload(library: SoundLibrary): Download {
  const state = stateOf(library);
  return useSyncExternalStore((listener) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }, () => state.current);
}

/** Whether the pack is in the ambience root; null until known. Read again whenever the library changes. */
function usePackPresent(library: SoundLibrary, download: Download): boolean | null {
  const version = useLibraryVersion(library);
  const [present, setPresent] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    hasStarterPack(library).then((found) => {
      if (current) setPresent(found);
    }, () => {
      if (current) setPresent(null);
    });
    return () => {
      current = false;
    };
  }, [library, version, download.phase]);
  return present;
}

/** Offers the starter ambience until it lies in the ambience folder; while it downloads, says how far it got. */
export function StarterPackButton({ library, actions, className }: { library: SoundLibrary; actions: LibraryActions; className: string }): React.JSX.Element | null {
  const download = useDownload(library);
  const present = usePackPresent(library, download);
  const downloading = download.phase === 'downloading';
  const failed = download.phase === 'failed';
  if (!downloading && (present !== false || !mayInstallStarterPack(library))) return null;
  const size = Math.round(STARTER_BYTES / 1_000_000);
  let content: React.ReactNode = <>{t('audio.library.starter')}<small>{t('audio.library.starterSize', { size })}</small></>;
  if (downloading) content = t('audio.library.starterDownloading', { percent: Math.floor(download.share * 100) });
  // The failure stays where it happened, as a row says "File not found": the button reads it and offers it again.
  if (failed) content = <><span className="atlas-sound-lib__starter-failed"><AlertTriangle aria-hidden="true" />{t('audio.library.starterFailedButton')}</span><small>{t('audio.library.starterFailedHint')}</small></>;
  return (
    <button
      type="button"
      className={cn('atlas-sound-lib__starter', className)}
      data-failed={failed || undefined}
      disabled={downloading}
      aria-busy={downloading}
      aria-label={downloading || failed ? undefined : t('audio.library.starterLabel', { count: STARTER_SOUND_COUNT, size })}
      onClick={() => startDownload(library, actions)}
    >
      {content}
    </button>
  );
}
