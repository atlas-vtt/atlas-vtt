import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../../../../i18n';
import { Button } from '../../../../../packages/components/primitives/button';
import { useLoadingReveal } from '../../../../../packages/components/primitives/useLoadingReveal';
import { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import type { LibraryPlace } from '../../../../../soundLibrary/libraryPlace';
import { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { mayCarryAudio } from '../../../../../soundLibrary/soundFiles';
import { parentOfRelative } from '../../../../../soundLibrary/soundPaths';
import { isLinked } from '../../../../../soundLibrary/SoundRoots';
import type { SoundKind } from '../../../../../sound/soundTypes';
import { useAtlasUI } from '../../../../root/AtlasUIContext';
import { arrowDirection, moveFocus } from '../../screenKeys';
import { useSoundValue, useStoredSounds, useStoreValue } from '../useSound';
import { LibraryHead } from './LibraryHead';
import { LibraryRail } from './LibraryRail';
import { folderRows, searchRows, waitingIn, type LibraryRow } from './rowModel';
import { LibraryRows } from './LibraryRows';
import { useHeldInMix, useLibraryVersion } from './useLibrary';
import { useLibraryActions } from './useLibraryActions';

/** Keys the library never keeps: Tab opens and closes the DM screen, and Escape closes what is open once nothing here uses it. */
const PASSES_THROUGH: ReadonlySet<string> = new Set(['Tab', 'Escape']);

function NoLink({ onLink, onImport }: { onLink: (kind: SoundKind, win: Window) => void; onImport: (doc: Document) => void }): React.JSX.Element {
  const winOf = (event: React.MouseEvent<HTMLElement>): Window => event.currentTarget.ownerDocument.defaultView ?? window;
  return (
    <div className="atlas-sound-lib__nolink">
      <h2>{t('audio.library.emptyTitle')}</h2>
      <p>{t('audio.library.emptyText')}</p>
      <div className="atlas-sound-lib__nolink-actions">
        <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--solid" variant="secondary" onClick={(event) => onLink('music', winOf(event))}>{t('audio.library.linkMusic')}</Button>
        <Button type="button" className="atlas-sound-lib__btn" variant="secondary" onClick={(event) => onLink('ambience', winOf(event))}>{t('audio.library.linkAmbience')}</Button>
        <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--quiet" variant="ghost" onClick={(event) => onImport(event.currentTarget.ownerDocument)}>{t('audio.library.importInstead')}</Button>
      </div>
    </div>
  );
}

/** The sound library: the folders linked as music and ambience, and what lies in them. */
export function LibraryView(): React.JSX.Element | null {
  const { app } = useAtlasUI();
  const library = SoundLibrary.forApp(app);
  const director = SoundDirector.forApp(app);
  const place = useStoreValue(library.place, () => library.place.current);
  const { kind, folder } = place;
  const version = useLibraryVersion(library);
  const sounds = useStoredSounds(app);
  const held = useHeldInMix(director);
  const shuffle = useSoundValue(director, ({ mix }) => mix.table.music?.shuffle ?? false);
  const actions = useLibraryActions(app, library, director);
  const [query, setQuery] = useState('');
  const searching = useDeferredValue(query.trim());
  const root = useRef<HTMLDivElement>(null);

  const goTo = useCallback((next: LibraryPlace): void => {
    setQuery('');
    library.place.show(next.kind, next.folder);
  }, [library]);

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

  const rootState = library.rootOf(place.kind);
  const linked = isLinked(rootState);
  const reachable = linked && library.locationOf(place.kind) !== null;
  const listing = reachable ? library.listing(place.kind, place.folder) : null;
  const lastListing = useRef(listing);
  if (listing) lastListing.current = listing;
  const loading = reachable && listing === null && searching === '';
  const showSkeleton = useLoadingReveal(loading);
  // A folder that takes a moment keeps what was there until its skeleton is due.
  const shownListing = listing ?? (loading && !showSkeleton ? lastListing.current : null);

  // Rows keep their objects while their folder does, so a walk's report renders none of them.
  const folderList = useMemo<readonly LibraryRow[]>(
    () => folderRows(place.kind, shownListing, waitingIn(library, sounds, place.kind, place.folder, listing, reachable)),
    [library, listing, place, reachable, shownListing, sounds],
  );
  const found = useMemo<readonly LibraryRow[] | null>(() => (searching === '' ? null : searchRows(library.search(searching), (kind) => t(kind === 'music' ? 'audio.music' : 'audio.ambience'))), [library, searching, version]);
  const rows = found ?? folderList;

  const openFolder = useCallback((row: Extract<LibraryRow, { type: 'folder' }>) => goTo({ kind: row.kind, folder: row.path }), [goTo]);

  const parent = useCallback((): boolean => {
    if (folder === '') return false;
    library.place.show(kind, parentOfRelative(folder));
    return true;
  }, [library, kind, folder]);

  const noRoots = library.rootOf('music').status === 'unlinked' && library.rootOf('ambience').status === 'unlinked';
  const keep = (event: React.KeyboardEvent): void => {
    if (PASSES_THROUGH.has(event.key)) return;
    event.stopPropagation();
    const direction = arrowDirection(event.key);
    const from = event.target as Element;
    if (direction && from.closest('.atlas-sound-lib__head button, .atlas-sound-lib__nolink button')) {
      event.preventDefault();
      moveFocus(from.closest('.atlas-sound-pane') ?? event.currentTarget, from, direction);
    }
  };

  if (noRoots) {
    return (
      <div className="atlas-sound-lib" ref={root} onKeyDown={keep}>
        <NoLink onLink={actions.link} onImport={actions.pickLoose} />
      </div>
    );
  }

  const dropFiles = (files: readonly File[]): void => actions.importInto(files, place.kind, place.folder);
  const emptyText = searching !== '' ? t('audio.library.noResults')
    : !linked ? t('audio.library.linkHere')
      : library.isMissing(place.kind, place.folder) ? t('audio.library.unreachable') : t('audio.library.folderEmpty');

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
      <LibraryRail library={library} actions={actions} place={place} onPlace={goTo} />
      <div className="atlas-sound-lib__main">
        <LibraryHead library={library} actions={actions} place={place} onPlace={goTo} query={query} onQuery={setQuery} shuffle={shuffle} />
        <LibraryRows
          rows={rows}
          loading={loading && showSkeleton}
          emptyText={emptyText}
          library={library}
          director={director}
          actions={actions}
          sounds={sounds}
          held={held}
          onOpenFolder={openFolder}
          onParent={parent}
          onDropFiles={dropFiles}
        />
      </div>
    </div>
  );
}
