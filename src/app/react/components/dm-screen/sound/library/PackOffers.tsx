import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../../../../i18n';
import { isActive } from '../../../../../downloads/downloadTypes';
import { LabelTooltip } from '../../../../../packages/components/primitives/tooltip';
import { installedMusicPacks, mayInstallMusicPacks, MUSIC_PACKS } from '../../../../../soundLibrary/musicPacks';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { hasStarterPack, mayInstallStarterPack, STARTER_BYTES, STARTER_SOUND_COUNT } from '../../../../../soundLibrary/starterPack';
import { cn } from '../../../../../../utils/cn';
import { useContextMenu } from '../../../../root/ContextMenuContext';
import { activeLabel, AMBIENCE_OFFER, MUSIC_OFFER, musicPackMenu, queueStarterAmbience, STARTER_JOB } from './packDownloads';
import { useDownloadJob, useDownloadManager, useOfferDismissal } from './useDownloads';
import { useLibraryVersion } from './useLibrary';
import type { LibraryActions } from './useLibraryActions';

/** An offer and the × that dismisses it; the root's ⋯ menu still offers the download. */
function Offer({ dismiss, children }: { dismiss: (() => void) | undefined; children: React.ReactNode }): React.JSX.Element {
  const label = t('audio.library.offerHide');
  return (
    <div className="atlas-sound-lib__offer">
      {children}
      {dismiss && (
        <LabelTooltip label={label}>
          <button type="button" className="atlas-sound-lib__offer-hide" aria-label={label} onClick={dismiss}>
            <X aria-hidden="true" />
          </button>
        </LabelTooltip>
      )}
    </div>
  );
}

/** Whether the pack is in the ambience root; null until known. Read again whenever the library changes or a download ends. */
function useStarterPresent(library: SoundLibrary, settled: string): boolean | null {
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
  }, [library, version, settled]);
  return present;
}

/** Offers the starter ambience until it lies in the ambience folder or the GM dismisses it; while it downloads, says how far it got. */
export function StarterPackButton({ library, actions, className }: { library: SoundLibrary; actions: LibraryActions; className: string }): React.JSX.Element | null {
  const manager = useDownloadManager();
  const job = useDownloadJob(manager, STARTER_JOB);
  const running = job && isActive(job) ? job : null;
  const present = useStarterPresent(library, job?.state ?? 'none');
  const { dismissed, dismiss } = useOfferDismissal(AMBIENCE_OFFER, t('audio.ambience'));
  if (dismissed || (!running && (present !== false || !mayInstallStarterPack(library)))) return null;
  const size = Math.round(STARTER_BYTES / 1_000_000);
  return (
    <Offer dismiss={running ? undefined : dismiss}>
      <button
        type="button"
        className={cn('atlas-sound-lib__starter', className)}
        disabled={running !== null}
        aria-busy={running !== null}
        aria-label={running ? undefined : t('audio.library.starterLabel', { count: STARTER_SOUND_COUNT, size })}
        onClick={() => queueStarterAmbience(manager, library, actions)}
      >
        {running ? activeLabel(running) : <>{t('audio.library.starter')}<small>{t('audio.library.starterSize', { size })}</small></>}
      </button>
    </Offer>
  );
}

/** Offers the starter music packs until every one lies in the music folder or the GM dismisses it. */
export function MusicPacksButton({ library, className }: { library: SoundLibrary; className: string }): React.JSX.Element | null {
  useLibraryVersion(library);
  const manager = useDownloadManager();
  const menu = useContextMenu();
  const { dismissed, dismiss } = useOfferDismissal(MUSIC_OFFER, t('audio.music'));
  const installed = installedMusicPacks(library);
  if (dismissed || installed === null || installed.size >= MUSIC_PACKS.length || !mayInstallMusicPacks(library)) return null;
  return (
    <Offer dismiss={dismiss}>
      <button
        type="button"
        className={cn('atlas-sound-lib__starter', className)}
        aria-haspopup="menu"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          menu.open(musicPackMenu(manager, library), { x: box.left, y: box.bottom }, { returnFocus: event.currentTarget, label: t('audio.library.musicPacks') });
        }}
      >
        {t('audio.library.musicPacks')}
      </button>
    </Offer>
  );
}
