import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { t } from '../../../../../i18n';
import { installedMusicPacks, installMusicPacks, mayInstallMusicPacks, MUSIC_FOLDER, MUSIC_PACKS, type MusicPackSummary } from '../../../../../soundLibrary/musicPacks';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { showNotice } from '../../../../../ui/notice';
import { cn } from '../../../../../../utils/cn';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../context-menu/AtlasContextMenu';
import { useContextMenu } from '../../../../root/ContextMenuContext';
import { startPackDownload, usePackDownload } from './packDownload';
import { useLibraryVersion } from './useLibrary';

const OFFER = 'Vindsvept music';

const megabytes = (bytes: number): number => Math.max(1, Math.round(bytes / 1_000_000));
const sumOf = (packs: readonly MusicPackSummary[], key: 'tracks' | 'bytes'): number => packs.reduce((sum, pack) => sum + pack[key], 0);

function startDownload(library: SoundLibrary, packs: readonly MusicPackSummary[]): void {
  const tracks = sumOf(packs, 'tracks');
  startPackDownload(library, OFFER, async (onStep) => {
    await installMusicPacks(library, packs.map((pack) => pack.id), { onStep });
  }, () => {
    library.place.show('music', [packs.length === 1 && packs[0] ? packs[0].name : MUSIC_FOLDER]);
    showNotice(t('audio.library.musicAdded', { count: tracks }));
  });
}

function packMenu(library: SoundLibrary, installed: ReadonlySet<string>): ContextMenuEntry[] {
  const missing = MUSIC_PACKS.filter((pack) => !installed.has(pack.id));
  const detail = (packs: readonly MusicPackSummary[]): string => t('audio.library.musicPackDetail', { count: sumOf(packs, 'tracks'), size: megabytes(sumOf(packs, 'bytes')) });
  return [
    { type: 'item', label: t('audio.library.musicPacksAll'), icon: 'download', detail: detail(missing), onClick: () => startDownload(library, missing) },
    MENU_SEPARATOR,
    ...MUSIC_PACKS.map((pack): ContextMenuEntry => ({
      type: 'item',
      label: pack.name,
      detail: detail([pack]),
      // Only a pack that is there is ticked; the others are plain rows, since choosing one downloads it.
      ...(installed.has(pack.id) ? { checked: true, disabled: true } : {}),
      onClick: () => startDownload(library, [pack]),
    })),
  ];
}

/** Offers Vindsvept's music packs until every one lies in the music folder; while one downloads, says how far it got. */
export function MusicPacksButton({ library, className }: { library: SoundLibrary; className: string }): React.JSX.Element | null {
  useLibraryVersion(library);
  const download = usePackDownload(library, OFFER);
  const menu = useContextMenu();
  const installed = installedMusicPacks(library);
  const downloading = download.phase === 'downloading';
  const failed = download.phase === 'failed';
  if (!downloading && (installed === null || installed.size >= MUSIC_PACKS.length || !mayInstallMusicPacks(library))) return null;

  let content: React.ReactNode = t('audio.library.musicPacks');
  if (downloading) content = t('audio.library.starterDownloading', { percent: Math.floor(download.share * 100) });
  if (failed) content = <><span className="atlas-sound-lib__starter-failed"><AlertTriangle aria-hidden="true" />{t('audio.library.starterFailedButton')}</span><small>{t('audio.library.starterFailedHint')}</small></>;
  return (
    <button
      type="button"
      className={cn('atlas-sound-lib__starter', className)}
      data-failed={failed || undefined}
      disabled={downloading}
      aria-busy={downloading}
      aria-haspopup="menu"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        menu.open(packMenu(library, installed ?? new Set()), { x: box.left, y: box.bottom }, { returnFocus: event.currentTarget, label: t('audio.library.musicPacks') });
      }}
    >
      {content}
    </button>
  );
}
