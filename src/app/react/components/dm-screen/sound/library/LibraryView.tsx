import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../../../../i18n';
import { Button } from '../../../../../packages/components/primitives/button';
import { useLoadingReveal } from '../../../../../packages/components/primitives/useLoadingReveal';
import { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { recordsByFile } from '../../../../../soundLibrary/libraryRecords';
import { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { mayCarryAudio } from '../../../../../soundLibrary/soundFiles';
import { isLinked } from '../../../../../soundLibrary/SoundRoots';
import { SETTLE_MS } from '../../../../../soundDirector/linkedFolderWatch';
import { tagKey, toggledTag } from '../../../../../soundLibrary/soundTags';
import type { SoundKind } from '../../../../../sound/soundTypes';
import { useAtlasUI } from '../../../../root/AtlasUIContext';
import { useMoods, useSoundValue, useStoredSounds, useStoreValue } from '../useSound';
import { moodsMatching } from '../moodSearch';
import { LibraryHead } from './LibraryHead';
import { LibraryRail } from './LibraryRail';
import { rowsWithTags, searchRows, shelfOf, type LibraryRow, type RootShelf } from './rowModel';
import { LibraryRows } from './LibraryRows';
import { StarterPackButton } from './StarterPack';
import { useHeldInMix, useLibraryVersion } from './useLibrary';
import { useLibraryActions, type LibraryActions } from './useLibraryActions';

/** Keys the library never keeps: Tab opens and closes the DM screen, and Escape closes what is open once nothing here uses it. */
const PASSES_THROUGH: ReadonlySet<string> = new Set(['Tab', 'Escape']);

function NoLink({ library, actions }: { library: SoundLibrary; actions: LibraryActions }): React.JSX.Element {
  const { link: onLink, pickLoose: onImport } = actions;
  const winOf = (event: React.MouseEvent<HTMLElement>): Window => event.currentTarget.ownerDocument.defaultView ?? window;
  return (
    <div className="atlas-sound-lib__nolink">
      <h2>{t('audio.library.emptyTitle')}</h2>
      <p>{t('audio.library.emptyText')}</p>
      {/* Two rows that each hold together: the links first, then what else brings sound in. */}
      <div className="atlas-sound-lib__nolink-actions">
        <div className="atlas-sound-lib__nolink-row">
          <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--solid" variant="secondary" onClick={(event) => onLink('music', winOf(event))}>{t('audio.library.linkMusic')}</Button>
          <Button type="button" className="atlas-sound-lib__btn" variant="secondary" onClick={(event) => onLink('ambience', winOf(event))}>{t('audio.library.linkAmbience')}</Button>
        </div>
        <div className="atlas-sound-lib__nolink-row">
          <StarterPackButton library={library} actions={actions} className="atlas-sound-lib__btn" />
          <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--quiet" variant="ghost" onClick={(event) => onImport(event.currentTarget.ownerDocument)}>{t('audio.library.importInstead')}</Button>
        </div>
      </div>
    </div>
  );
}

/** Until the watch has asked for a new root's copies and a little after, as their conversion starts in turn. */
const PREPARING_MS = SETTLE_MS + 1000;

/** Whether the roots changed (a folder linked) within the last `PREPARING_MS`; never on the first render. */
function useJustLinked(rootsKey: string): boolean {
  const [just, setJust] = useState(false);
  const first = useRef(rootsKey);
  useEffect(() => {
    if (rootsKey === first.current) return undefined;
    first.current = rootsKey;
    setJust(true);
    const timer = window.setTimeout(() => setJust(false), PREPARING_MS);
    return () => window.clearTimeout(timer);
  }, [rootsKey]);
  return just;
}

interface LibraryViewProps {
  /** The search as typed. The page holds it, since it narrows the moods beside the library too. */
  query: string;
  onQuery: (query: string) => void;
}

/** The sound library: the folders linked as music and ambience, all that lies in them, narrowed by tags. */
export function LibraryView({ query, onQuery: setQuery }: LibraryViewProps): React.JSX.Element | null {
  const { app } = useAtlasUI();
  const library = SoundLibrary.forApp(app);
  const director = SoundDirector.forApp(app);
  const place = useStoreValue(library.place, () => library.place.current);
  const version = useLibraryVersion(library);
  const sounds = useStoredSounds(app);
  const held = useHeldInMix(director);
  const shuffle = useSoundValue(director, ({ mix }) => mix.table.music?.shuffle ?? false);
  const moods = useMoods(app);
  const actions = useLibraryActions(app, library, director);
  const searching = useDeferredValue(query.trim());
  const root = useRef<HTMLDivElement>(null);

  // What changed on disk while the GM was elsewhere is read on opening the library and on returning to the window.
  useEffect(() => {
    library.rescan();
    const win = root.current?.ownerDocument.defaultView ?? window;
    const back = (): void => library.rescan();
    win.addEventListener('focus', back);
    return () => win.removeEventListener('focus', back);
  }, [library]);

  useEffect(() => () => director.preview(null), [director]);

  // A root just linked is read at once.
  const rootsKey = JSON.stringify([library.rootOf('music'), library.rootOf('ambience')]);
  useEffect(() => library.rescan(), [library, rootsKey]);

  // A folder just linked is prepared once it has settled (`LinkedFolderWatch`): its rows say so from the start,
  // rather than standing as if nothing were coming until their conversion begins.
  const preparing = useJustLinked(rootsKey) && director.isOn;

  const musicFiles = library.filesOf('music');
  const ambienceFiles = library.filesOf('ambience');
  const read = `${library.isWalked('music')}|${library.isWalked('ambience')}|${rootsKey}`;
  // Where a file is on this device changes with what the library has read.
  const soundsByPath = useMemo(() => recordsByFile(sounds, library), [sounds, library, musicFiles, ambienceFiles, read]);
  // Rows keep their objects while the files and records do, so a walk that found nothing new renders none of them.
  const shelves = useMemo<Record<SoundKind, RootShelf>>(() => ({
    music: shelfOf(library, sounds, soundsByPath, 'music'),
    ambience: shelfOf(library, sounds, soundsByPath, 'ambience'),
  }), [library, sounds, soundsByPath]);
  const shelf = shelves[place.kind];

  // A tag selected that no track has any more selects nothing.
  const selected = useMemo(() => shelf.tags.filter((tag) => place.tags.some((name) => tagKey(name) === tag.key)), [place.tags, shelf.tags]);
  const selectedKeys = useMemo(() => new Set(selected.map((tag) => tag.key)), [selected]);
  const listed = useMemo(() => rowsWithTags(shelf.rows, [...selectedKeys]), [selectedKeys, shelf.rows]);
  const found = useMemo<readonly LibraryRow[] | null>(() => (searching === '' ? null : searchRows(library.search(searching), (kind) => t(kind === 'music' ? 'audio.music' : 'audio.ambience'))), [library, searching, version]);
  // The one search narrows the moods beside the library too (by name, or by a sound they hold).
  const foundMoods = useMemo(() => moodsMatching(moods, searching, director), [moods, searching, director, version]);
  // Enter starts the first result: a mood where one matches, else what the first file row's Play would play.
  const firstFound = found?.find((row) => row.type === 'file');
  const firstMood = foundMoods[0];
  let playFirst: { name: string; play: () => void } | null = null;
  if (firstMood) playFirst = { name: firstMood.name, play: () => director.press(firstMood) };
  else if (firstFound?.type === 'file') playFirst = { name: firstFound.name, play: () => actions.toMix([firstFound.file], firstFound.file.kind === 'music' ? 'now' : 'add') };
  const rows = found ?? listed;

  const linked = isLinked(library.rootOf(place.kind));
  const loading = library.locationOf(place.kind) !== null && !library.isWalked(place.kind) && listed.length === 0 && searching === '';
  const showSkeleton = useLoadingReveal(loading);

  const showRoot = useCallback((kind: SoundKind): void => {
    setQuery('');
    library.place.show(kind);
  }, [library, setQuery]);

  const pressTag = useCallback((kind: SoundKind, tag: string): void => {
    setQuery('');
    library.place.show(kind, kind === place.kind ? toggledTag(selected.map(({ name }) => name), tag) : [tag]);
  }, [library, place.kind, selected, setQuery]);

  const noRoots = library.rootOf('music').status === 'unlinked' && library.rootOf('ambience').status === 'unlinked';
  const keep = (event: React.KeyboardEvent): void => {
    if (PASSES_THROUGH.has(event.key)) return;
    event.stopPropagation();
  };

  if (noRoots) {
    return (
      <div className="atlas-sound-lib" ref={root} onKeyDown={keep}>
        <NoLink library={library} actions={actions} />
      </div>
    );
  }

  const dropFiles = (files: readonly File[]): void => actions.importInto(files, place.kind);
  const emptyText = searching !== '' ? t('audio.library.noResults', { query: searching })
    : selected.length > 0 ? t('audio.library.noneTagged')
      : !linked ? t('audio.library.linkHere')
        : library.isMissing(place.kind) ? t('audio.library.unreachable') : t('audio.library.folderEmpty');

  return (
    <div
      className="atlas-sound-lib"
      ref={root}
      onKeyDown={keep}
      onDragOver={(event) => {
        if (mayCarryAudio(event.dataTransfer)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        dropFiles([...event.dataTransfer.files]);
      }}
    >
      <LibraryRail library={library} actions={actions} shelves={shelves} kind={searching === '' ? place.kind : null} selected={selectedKeys} onRoot={showRoot} onTag={pressTag} />
      <div className="atlas-sound-lib__main">
        <LibraryHead library={library} actions={actions} kind={place.kind} rows={found ?? listed} scope={found ? 'results' : selected.length > 0 ? 'tagged' : 'all'} query={query} onQuery={setQuery} shuffle={shuffle} first={playFirst} />
        <LibraryRows
          rows={rows}
          preparing={preparing}
          loading={loading && showSkeleton}
          emptyText={emptyText}
          onClearSearch={searching === '' ? undefined : () => setQuery('')}
          library={library}
          director={director}
          actions={actions}
          soundsByPath={soundsByPath}
          shelves={shelves}
          held={held}
          onDropFiles={dropFiles}
        />
      </div>
    </div>
  );
}
