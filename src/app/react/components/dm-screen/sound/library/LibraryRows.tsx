import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { t } from '../../../../../i18n';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../../../../packages/components/primitives/Skeleton';
import { useScrollbarGutter } from '../../../../../packages/components/primitives/useScrollbarGutter';
import type { SoundRecord } from '../../../../../sound/soundTypes';
import type { HeldInMix } from '../../../../../soundDirector/libraryDesk';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { unrecordedSound, recordOfFile } from '../../../../../soundLibrary/libraryRecords';
import { carriesSounds, writeSoundDrag } from '../../../../../soundLibrary/soundDrag';
import { mayCarryAudio } from '../../../../../soundLibrary/soundFiles';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { safeName } from '../../../../../soundLibrary/soundPaths';
import { soundRecordOf, type StoredSound } from '../../../../../soundLibrary/soundRecords';
import { showNotice } from '../../../../../ui/notice';
import { useContextMenu } from '../../../../root/ContextMenuContext';
import { moveFocus } from '../../screenKeys';
import { useSoundValue } from '../useSound';
import { LibraryRow, type RowHandlers } from './LibraryRow';
import { dropOnFolder } from './libraryDrop';
import { entryOfRow, selectionAfter, type LibraryRow as Row } from './rowModel';
import { useRowKeys } from './useRowKeys';
import { rowMenu } from './rowMenus';
import type { LibraryActions } from './useLibraryActions';

const ROW_HEIGHT = 38;
const OVERSCAN = 12;
const SKELETON_ROWS = 9;

interface LibraryRowsProps {
  rows: readonly Row[];
  loading: boolean;
  /** The one line shown when there are no rows. */
  emptyText: string;
  library: SoundLibrary;
  director: SoundDirector;
  actions: LibraryActions;
  sounds: readonly StoredSound[];
  held: ReadonlyMap<string, HeldInMix>;
  onOpenFolder: (row: Extract<Row, { type: 'folder' }>) => void;
  onParent: () => boolean;
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

/** The open folder's rows, or a search's: only those in view are mounted, so a folder of thousands scrolls like one of ten. */
export function LibraryRows({ rows, loading, emptyText, library, director, actions, sounds, held, onOpenFolder, onParent, onDropFiles }: LibraryRowsProps): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  useScrollbarGutter(scrollElement);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const menu = useContextMenu();
  const previewing = useSoundValue(director, (snapshot) => snapshot.previewing);
  useSoundValue(director, (snapshot) => snapshot.shelfRevision);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    // Rows on the first frame, not after a measure: no folder opens empty.
    initialRect: { width: 0, height: ROW_HEIGHT * SKELETON_ROWS },
  });

  // What is selected belongs to what shows; a change of the rows keeps what is still there.
  useEffect(() => {
    setSelected((current) => {
      const ids = new Set(rows.map((row) => row.id));
      const kept = [...current].filter((id) => ids.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
    setActiveIndex((index) => Math.min(index, Math.max(0, rows.length - 1)));
  }, [rows]);

  const soundsByPath = useMemo(() => {
    const byPath = new Map<string, StoredSound[]>();
    for (const sound of sounds) byPath.set(sound.audioPath, [...(byPath.get(sound.audioPath) ?? []), sound]);
    return byPath;
  }, [sounds]);

  const audioPathOf = useCallback((row: Row): string | null => (row.type === 'file' ? library.audioPathOf(row.file.kind, row.file.path) : null), [library]);

  const recordOfRow = useCallback((row: Row): StoredSound | null => {
    const path = audioPathOf(row);
    return path === null ? null : recordOfFile(soundsByPath.get(path) ?? [], path);
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
    menu.open(rowMenu(row, {
      actions,
      rows: acting,
      entries: acting.flatMap((one) => entryOfRow(one) ?? []),
      sound: recordOfRow(row),
      beginRename: (target) => setRenaming(target.id),
    }), at, { returnFocus: anchorElement ?? scroller.current });
  }, [actions, inHand, menu, recordOfRow, selected]);

  const primary = useCallback((row: Row): void => {
    if (row.type === 'folder') {
      onOpenFolder(row);
      return;
    }
    if (row.type !== 'file') return;
    const path = audioPathOf(row);
    const inMix = path === null ? undefined : held.get(path);
    if (inMix) actions.takeOut(inMix);
    else actions.toMix(inHand(row).flatMap((one) => (one.type === 'file' ? [one.file] : [])), row.file.kind === 'music' ? 'next' : 'add');
  }, [actions, audioPathOf, held, inHand, onOpenFolder]);

  const handlers = useMemo<RowHandlers>(() => ({
    onPress: (row, event) => {
      const next = selectionAfter(rows, selected, anchor, row.id, { toggle: event.metaKey || event.ctrlKey, range: event.shiftKey });
      setSelected(next.selected);
      setAnchor(next.anchor);
      setActiveIndex(rows.indexOf(row));
      scroller.current?.focus();
    },
    onOpen: primary,
    onPrimary: primary,
    onPreview: (row) => {
      if (row.type === 'file') actions.preview(row.file);
    },
    onMenu: openMenu,
    onDragStart: (row, event) => {
      const acting = inHand(row);
      writeSoundDrag(event.dataTransfer, {
        files: acting.flatMap((one) => (one.type === 'file' ? [one.file] : [])),
        folders: acting.flatMap((one) => (one.type === 'folder' ? [{ kind: one.kind, path: one.path }] : [])),
      });
    },
    onDropOnFolder: (row, event) => dropOnFolder(actions, event, row.kind, row.path),
    onRename: (row, name) => {
      setRenaming(null);
      scroller.current?.focus();
      const entry = entryOfRow(row);
      if (name === null || name === row.name || !entry) return;
      const safe = safeName(name);
      if (safe === null) {
        showNotice(t('audio.library.badName'));
        return;
      }
      const extension = row.type === 'file' ? row.file.name.slice(row.name.length) : '';
      actions.rename(entry, `${safe}${extension}`);
    },
  }), [actions, anchor, inHand, openMenu, primary, rows, selected]);

  const onLeave = (direction: 'left' | 'right' | 'up'): void => {
    const list = scroller.current;
    if (list) moveFocus(list.closest('.atlas-sound-pane') ?? list, list, direction);
  };

  const keyDown = useRowKeys({ rows, activeIndex, setActiveIndex, selected, setSelected, anchor, setAnchor, scrollTo: (index) => virtualizer.scrollToIndex(index), actions, primary, inHand, onParent, onLeave, onOpenFolder, setRenaming, openMenu, list: scroller });

  const activeId = rows[activeIndex]?.id;

  return (
    <div
      ref={(element) => {
        scroller.current = element;
        setScrollElement(element);
      }}
      className="atlas-sound-lib__rows"
      role="grid"
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
      {!loading && rows.length === 0 && <p className="atlas-sound-lib__none">{emptyText}</p>}
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
                count={row.type === 'folder' ? library.countOf(row.kind, row.path) : null}
                held={path === null ? undefined : held.get(path)}
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
