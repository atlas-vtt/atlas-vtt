import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { t } from '../../../../../i18n';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../../../../packages/components/primitives/Skeleton';
import { useScrollbarGutter } from '../../../../../packages/components/primitives/useScrollbarGutter';
import type { SoundKind, SoundRecord } from '../../../../../sound/soundTypes';
import { soundsNow, type HeldInMix } from '../../../../../soundDirector/libraryDesk';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { standingRecord, unrecordedSound } from '../../../../../soundLibrary/libraryRecords';
import { carriesSounds, writeSoundDrag } from '../../../../../soundLibrary/soundDrag';
import { mayCarryAudio } from '../../../../../soundLibrary/soundFiles';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { safeName } from '../../../../../soundLibrary/soundPaths';
import { soundRecordOf, type StoredSound } from '../../../../../soundLibrary/soundRecords';
import { showNotice } from '../../../../../ui/notice';
import { useContextMenu } from '../../../../root/ContextMenuContext';
import { useSoundValue } from '../useSound';
import { useSoundingKey } from './useLibrary';
import { useSoundHold } from '../soundHold';
import { LibraryRow, type RowHandlers } from './LibraryRow';
import { entryOfRow, filesOfRows, selectionAfter, type LibraryRow as Row, type RootShelf } from './rowModel';
import { useRowKeys } from './useRowKeys';
import { rowMenu } from './rowMenus';
import type { LibraryActions } from './useLibraryActions';

const ROW_HEIGHT = 38;
/** Under a coarse pointer a row's controls take 44 px (DECISIONS #24), and so does the row. */
const TOUCH_ROW_HEIGHT = 44;
const COARSE = '(pointer: coarse)';

/** The rows' height for the pointer there is, followed when it changes (a tablet's keyboard cover). */
function useRowHeight(): number {
  const [coarse, setCoarse] = useState(() => window.matchMedia(COARSE).matches);
  useEffect(() => {
    const query = window.matchMedia(COARSE);
    const follow = (): void => setCoarse(query.matches);
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);
  return coarse ? TOUCH_ROW_HEIGHT : ROW_HEIGHT;
}
const OVERSCAN = 12;
const SKELETON_ROWS = 9;

interface LibraryRowsProps {
  rows: readonly Row[];
  loading: boolean;
  /** A folder was just linked: rows not yet converted say they are being prepared. */
  preparing: boolean;
  /** The one line shown when there are no rows. */
  emptyText: string;
  /** Offered beside the empty text while a search finds nothing. */
  onClearSearch?: (() => void) | undefined;
  library: SoundLibrary;
  director: SoundDirector;
  actions: LibraryActions;
  /** The records of each file, as this device finds them. */
  soundsByPath: ReadonlyMap<string, readonly StoredSound[]>;
  shelves: Readonly<Record<SoundKind, RootShelf>>;
  held: ReadonlyMap<string, HeldInMix>;
  onDropFiles: (files: readonly File[]) => void;
}

/** The rows' skeleton: real rows' places, so the content replaces it without a shift. */
function RowsSkeleton(): React.JSX.Element {
  return (
    <SkeletonGroup label={t('audio.library.loading')} className="atlas-sound-lib__skeleton">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className="atlas-sound-lib__row">
          <span />
          <span className="atlas-sound-lib__name"><Skeleton shape="text" width={skeletonTextWidth(index, 42)} /></span>
          <span />
          <span className="atlas-sound-lib__length"><Skeleton shape="text" width={32} /></span>
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** What the library lists, or a search's hits: only those in view are mounted, so thousands scroll like ten. */
export function LibraryRows({ rows, loading, preparing, emptyText, onClearSearch, library, director, actions, soundsByPath, shelves, held, onDropFiles }: LibraryRowsProps): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  useScrollbarGutter(scrollElement);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const menu = useContextMenu();
  const previewing = useSoundValue(director, (snapshot) => snapshot.previewing);
  const soundingKey = useSoundingKey(director);
  const hold = useSoundHold(director);
  // Paused music is in no list the mix holds: its track keeps its mark by its id.
  const heldTrack = hold !== null && soundingKey !== null ? director.shelf.idOfKey(soundingKey) : null;
  useSoundValue(director, (snapshot) => snapshot.shelfRevision);

  const rowHeight = useRowHeight();
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    // Rows on the first frame, not after a measure: no list opens empty.
    initialRect: { width: 0, height: rowHeight * SKELETON_ROWS },
  });
  useEffect(() => virtualizer.measure(), [virtualizer, rowHeight]);

  // What is selected belongs to what shows; a change of the rows keeps what is still there.
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(rows.map((row) => row.id));
      const kept = [...current].filter((id) => ids.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
    setActiveIndex((index) => Math.min(index, Math.max(0, rows.length - 1)));
  }, [rows]);

  const audioPathOf = useCallback((row: Row): string | null => (row.type === 'file' ? library.audioPathOf(row.file.kind, row.file.path) : null), [library]);

  const recordOfRow = useCallback((row: Row): StoredSound | null => {
    const path = audioPathOf(row);
    return path === null ? null : standingRecord(soundsByPath.get(path) ?? []);
  }, [audioPathOf, soundsByPath]);

  const soundOfRow = useCallback((row: Row): SoundRecord | null => {
    const path = audioPathOf(row);
    if (row.type !== 'file' || path === null) return null;
    const stored = recordOfRow(row);
    return stored ? soundRecordOf(stored) : unrecordedSound(row.file, path);
  }, [audioPathOf, recordOfRow]);

  const inHand = useCallback((row: Row): Row[] => (selected.has(row.id) ? rows.filter((one) => selected.has(one.id)) : [row]), [rows, selected]);

  const openMenu = useCallback((row: Row, at: { x: number; y: number }, anchorElement: HTMLElement | null): void => {
    const acting = inHand(row);
    if (!selected.has(row.id)) {
      setSelected(new Set([row.id]));
      setAnchor(row.id);
    }
    const kind = row.type === 'file' ? row.file.kind : 'music';
    const other: SoundKind = kind === 'music' ? 'ambience' : 'music';
    menu.open(rowMenu(row, {
      actions,
      rows: acting,
      entries: acting.flatMap((one) => entryOfRow(one) ?? []),
      sound: recordOfRow(row),
      rootTags: shelves[kind].tags,
      moveTo: library.locationOf(other) ? other : null,
      beginRename: (target) => setRenaming(target.id),
    }), at, { returnFocus: anchorElement ?? scroller.current, label: t('audio.moodMenu', { name: acting.length > 1 ? t('audio.library.selectedCount', { count: acting.length }) : row.name }) });
  }, [actions, inHand, library, menu, recordOfRow, selected, shelves]);

  const heldOf = useCallback((row: Row): HeldInMix | undefined => {
    const path = audioPathOf(row);
    return path === null ? undefined : held.get(path);
  }, [audioPathOf, held]);

  const sendToMix = useCallback((row: Row, music: 'now' | 'next'): void => {
    if (row.type !== 'file') return;
    actions.toMix(filesOfRows(inHand(row)), row.file.kind === 'music' ? music : 'add');
  }, [actions, inHand]);

  const primary = useCallback((row: Row): void => {
    if (row.type === 'waiting') {
      if (actions.mayRelink(row.sound.kind)) actions.relink(row.sound);
      return;
    }
    const inMix = heldOf(row);
    if (inMix) actions.takeOut(inMix);
    else sendToMix(row, 'next');
  }, [actions, heldOf, sendToMix]);

  const handlers = useMemo<RowHandlers>(() => ({
    onPress: (row, event) => {
      const next = selectionAfter(rows, selected, anchor, row.id, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey });
      setSelected(next.selected);
      setAnchor(next.anchor);
      setActiveIndex(rows.indexOf(row));
      scroller.current?.focus();
    },
    onPrimary: primary,
    onPlay: (row) => {
      director.preview(null);
      const inMix = heldOf(row);
      if (inMix && soundsNow(inMix, soundingKey)) actions.takeOut(inMix);
      else sendToMix(row, 'now');
    },
    onPreview: (row) => {
      if (row.type === 'file') actions.preview(row.file);
    },
    onMenu: openMenu,
    mayRelink: actions.mayRelink,
    onDragStart: (row, event) => writeSoundDrag(event.dataTransfer, { files: filesOfRows(inHand(row)) }),
    onRename: (row, name) => {
      setRenaming(null);
      scroller.current?.focus();
      if (name === null || name === row.name || row.type !== 'file') return;
      const safe = safeName(name);
      if (safe === null) {
        showNotice(t('audio.library.badName'));
        return;
      }
      actions.rename(row.file, `${safe}${row.file.name.slice(row.name.length)}`);
    },
  }), [actions, anchor, director, heldOf, inHand, openMenu, primary, rows, selected, sendToMix, soundingKey]);

  const keyDown = useRowKeys({ rows, activeIndex, setActiveIndex, selected, setSelected, anchor, setAnchor, scrollTo: (index) => virtualizer.scrollToIndex(index), actions, primary, inHand, setRenaming, openMenu, list: scroller });

  const activeId = rows[activeIndex]?.id;

  return (
    <div
      ref={(element) => {
        scroller.current = element;
        setScrollElement(element);
      }}
      className="atlas-sound-lib__rows"
      role="grid"
      aria-label={t('audio.library.rowsLabel')}
      aria-multiselectable="true"
      aria-rowcount={rows.length}
      aria-activedescendant={activeId === undefined ? undefined : `atlas-sound-row-${activeId}`}
      tabIndex={0}
      onKeyDown={keyDown}
      onDragOver={(event) => {
        if (mayCarryAudio(event.dataTransfer) && !carriesSounds(event.dataTransfer)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (carriesSounds(event.dataTransfer) || event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        onDropFiles([...event.dataTransfer.files]);
      }}
    >
      {loading && <RowsSkeleton />}
      {!loading && rows.length === 0 && (
        <div className="atlas-sound-lib__none">
          <p>{emptyText}</p>
          {onClearSearch && <button type="button" className="atlas-sound-lib__btn" onClick={onClearSearch}>{t('audio.library.clearSearch')}</button>}
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const path = audioPathOf(row);
            const sound = soundOfRow(row);
            return (
              <LibraryRow
                key={row.id}
                row={row}
                library={library}
                handlers={handlers}
                selected={selected.has(row.id)}
                active={item.index === activeIndex}
                renaming={renaming === row.id}
                held={path === null ? undefined : held.get(path)}
                sounding={(path !== null && soundsNow(held.get(path), soundingKey)) || (heldTrack !== null && sound?.id === heldTrack)}
                hold={hold === 'paused' && sound?.id !== heldTrack ? null : hold}
                preparing={preparing}
                previewing={previewing !== null && previewing === sound?.id}
                conversion={sound && director.shelf.stateOf(sound)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
