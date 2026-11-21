import { t } from '../../../../../i18n';
import type { DownloadManager } from '../../../../../downloads/DownloadManager';
import { isActive, type DownloadJob } from '../../../../../downloads/downloadTypes';
import { explainStockPackError } from '../../../../../services/stockPacks/verifiedFetch';
import { installMusicPacks, mayInstallMusicPacks, musicPackTrackCounts, MUSIC_PACKS, type MusicPackSummary } from '../../../../../soundLibrary/musicPacks';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { installStarterPack, mayInstallStarterPack, STARTER_BYTES, STARTER_FILES, STARTER_FOLDER } from '../../../../../soundLibrary/starterPack';
import { MENU_SEPARATOR, type ContextMenuEntry } from '../../../context-menu/AtlasContextMenu';
import type { LibraryActions } from './useLibraryActions';

/** The Sound page's offers, as the settings name the dismissed ones. Never change an id. */
export const AMBIENCE_OFFER = 'starter-ambience';
export const MUSIC_OFFER = 'starter-music';

/** The starter ambience's job; a music pack's is `music-pack:<pack id>`. */
export const STARTER_JOB = 'starter-ambience';
export const musicJobOf = (pack: Pick<MusicPackSummary, 'id'>): string => `music-pack:${pack.id}`;

const megabytes = (bytes: number): number => Math.max(1, Math.round(bytes / 1_000_000));

/** How far a job has come, as a whole percent. */
export function percentOf(job: Pick<DownloadJob, 'done' | 'total'>): number {
  return job.total.bytes > 0 ? Math.floor((job.done.bytes / job.total.bytes) * 100) : 0;
}

/** A job still ahead, said in a word or a number: what an offer shows in place of starting it again. */
export function activeLabel(job: DownloadJob): string {
  return job.state === 'queued' ? t('downloads.queued') : t('downloads.percent', { percent: percentOf(job) });
}

export function queueStarterAmbience(manager: DownloadManager, library: SoundLibrary, actions: LibraryActions): void {
  const show = (): void => library.place.show('ambience', [STARTER_FOLDER]);
  manager.enqueue({
    id: STARTER_JOB,
    title: t('audio.library.starterJob'),
    origin: 'starter-ambience',
    estimate: { bytes: STARTER_BYTES, files: STARTER_FILES.length },
    run: (progress) => installStarterPack(library, { progress }),
    onDone: () => {
      // Copies are made at first play otherwise, which keeps a press waiting for seconds.
      actions.prepare('ambience', STARTER_FOLDER);
      show();
    },
    reveal: show,
    explain: explainStockPackError,
  });
}

/** One job per pack, so each lands whole and is shown in the panel on its own. */
export function queueMusicPacks(manager: DownloadManager, library: SoundLibrary, packs: readonly MusicPackSummary[]): void {
  for (const pack of packs) {
    manager.enqueue({
      id: musicJobOf(pack),
      title: t('audio.library.musicJob', { pack: pack.name }),
      origin: 'music-pack',
      estimate: { bytes: pack.bytes, files: pack.tracks },
      run: async (progress) => {
        await installMusicPacks(library, [pack.id], { progress });
      },
      reveal: () => library.place.show('music', [pack.name]),
      explain: explainStockPackError,
    });
  }
}

function packRow(manager: DownloadManager, library: SoundLibrary, pack: MusicPackSummary, have: number): ContextMenuEntry {
  const job = manager.job(musicJobOf(pack));
  const start = (): void => queueMusicPacks(manager, library, [pack]);
  if (job && isActive(job)) return { type: 'item', label: pack.name, detail: activeLabel(job), disabled: true, onClick: start };
  // Only a pack that is there is ticked; the others are plain rows, since choosing one downloads it.
  if (have >= pack.tracks) return { type: 'item', label: pack.name, detail: t('audio.library.musicPackDetail', { count: pack.tracks, size: megabytes(pack.bytes) }), checked: true, disabled: true, onClick: start };
  const detail = have > 0
    ? t('audio.library.musicPackRest', { have, count: pack.tracks })
    : t('audio.library.musicPackDetail', { count: pack.tracks, size: megabytes(pack.bytes) });
  return { type: 'item', label: pack.name, detail, onClick: start };
}

/** All packs, then a row per pack: there (ticked), on its way, partly there, or not yet. Read anew on every opening. */
export function musicPackMenu(manager: DownloadManager, library: SoundLibrary): ContextMenuEntry[] {
  const counts = musicPackTrackCounts(library) ?? new Map<string, number>();
  const haveOf = (pack: MusicPackSummary): number => counts.get(pack.id) ?? 0;
  const missing = MUSIC_PACKS.filter((pack) => haveOf(pack) < pack.tracks && !isActive(manager.job(musicJobOf(pack)) ?? { state: 'done' }));
  const sum = (key: 'tracks' | 'bytes'): number => missing.reduce((total, pack) => total + pack[key], 0);
  return [
    {
      type: 'item',
      label: t('audio.library.musicPacksAll'),
      detail: t('audio.library.musicPackDetail', { count: sum('tracks'), size: megabytes(sum('bytes')) }),
      disabled: missing.length === 0,
      onClick: () => queueMusicPacks(manager, library, missing),
    },
    MENU_SEPARATOR,
    ...MUSIC_PACKS.map((pack) => packRow(manager, library, pack, haveOf(pack))),
  ];
}

/** Whether the ambience root lists a file of the starter pack; a sync read of what the library has walked. */
function starterListed(library: SoundLibrary): boolean {
  const paths = new Set(STARTER_FILES.map((file) => `${STARTER_FOLDER}/${file.name}`));
  return library.filesOf('ambience').some(({ entry }) => paths.has(entry.path));
}

/**
 * The offer in a root's ⋯ menu, so a GM who dismissed it can still download on purpose: the music packs as a
 * submenu that follows the downloads while open, the starter ambience as one row.
 */
export function offerMenuEntries(manager: DownloadManager, library: SoundLibrary, actions: LibraryActions, kind: 'music' | 'ambience'): ContextMenuEntry[] {
  if (kind === 'music') {
    if (!mayInstallMusicPacks(library)) return [];
    return [{ type: 'submenu', label: t('audio.library.musicPacks'), icon: 'download', children: () => musicPackMenu(manager, library), subscribe: (onChange) => manager.subscribe(onChange) }];
  }
  if (!mayInstallStarterPack(library)) return [];
  const job = manager.job(STARTER_JOB);
  const running = job && isActive(job) ? job : null;
  const listed = starterListed(library);
  return [{
    type: 'item',
    label: t('audio.library.starter'),
    ...(running ? { detail: activeLabel(running) } : listed ? { checked: true } : { detail: t('audio.library.starterSize', { size: megabytes(STARTER_BYTES) }) }),
    disabled: running !== null || listed,
    onClick: () => queueStarterAmbience(manager, library, actions),
  }];
}
