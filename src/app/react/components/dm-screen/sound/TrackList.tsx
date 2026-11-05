import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AudioLines, Check, ChevronRight, GripVertical, ListX, MoreHorizontal, Play, X } from 'lucide-react';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { t } from '../../../../i18n';
import type { SoundInfo } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { scrollWithin } from '../../../../utils/scrollWithin';
import { IconAction } from './IconAction';
import { clock } from './musicClock';
import { useListDrag } from './useListDrag';
import { useListView } from './useListView';
import { useSoundValue } from './useSound';
import { SOUND_KEYS } from './useSoundKeys';
import { useContextMenu } from '../../../root/ContextMenuContext';

const NO_WAITING: readonly string[] = [];
const trackKey = (track: SoundInfo): string => track.key;
const canMoveAny = (): boolean => true;

interface TrackRowProps {
  director: SoundDirector;
  track: SoundInfo;
  current: boolean;
  /** Where the list may be ordered by hand; while shuffled the order is the seed's. */
  movable: boolean;
  dragging: boolean;
  onDragStart: (track: SoundInfo, event: React.PointerEvent<HTMLElement>) => void;
  onMenu: (track: SoundInfo, anchor: HTMLElement, at?: { x: number; y: number }) => void;
}

const TrackRow = React.memo(function TrackRow({ director, track, current, movable, dragging, onDragStart, onMenu }: TrackRowProps): React.JSX.Element {
  const name = director.shelf.recordOfKey(track.key)?.name ?? '';
  return (
    <li
      className="atlas-sound-track"
      data-track={track.key}
      data-current={current || undefined}
      data-dragging={dragging || undefined}
      aria-current={current || undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(track, event.currentTarget, { x: event.clientX, y: event.clientY });
      }}
    >
      {movable && (
        <LabelTooltip label={t('audio.moveTrack', { name })}>
          <button type="button" className="atlas-sound-icon atlas-sound-track__grip" aria-label={t('audio.moveTrack', { name })} onPointerDown={(event) => onDragStart(track, event)}>
            <GripVertical />
          </button>
        </LabelTooltip>
      )}
      {current
        ? <span className="atlas-sound-track__mark" role="img" aria-label={t('audio.playingTag')}><AudioLines aria-hidden="true" /></span>
        : <IconAction label={t('audio.playTrack', { name })} icon={Play} onClick={() => director.desk.playTrack(track.key)} />}
      <span className="atlas-sound-track__name">{name}</span>
      <span className="atlas-sound-track__length">{clock(track.frames)}</span>
      {/* Move up and down without a drag (WCAG 2.5.7), and from the keyboard: the row's own menu. */}
      <IconAction label={t('audio.trackMenu', { name })} icon={MoreHorizontal} className="atlas-sound-track__menu" onClick={(event) => onMenu(track, event.currentTarget)} />
      <IconAction label={t('audio.remove', { name })} icon={X} className="atlas-sound-track__remove" onClick={() => director.desk.removeTrack(track.key)} />
    </li>
  );
});

/** What played this session, folded: names from this side's records, in nothing anyone else gets. */
function PlayedTracks({ director, current }: { director: SoundDirector; current: string | null }): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const played = useSoundValue(director, (snapshot) => snapshot.played);
  const rows = played.flatMap((key) => {
    const name = key === current ? undefined : director.shelf.recordOfKey(key)?.name;
    return name === undefined ? [] : [{ key, name }];
  });
  if (rows.length === 0) return null;
  return (
    <section className="atlas-sound-played">
      <button type="button" className="atlas-sound-played__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight aria-hidden="true" />
        {t('audio.played')}
      </button>
      {open && (
        <ul className="atlas-sound-tracks">
          {rows.map(({ key, name }) => (
            <li key={key} className="atlas-sound-track">
              <IconAction label={t('audio.playTrack', { name })} icon={Play} onClick={() => director.desk.playPlayed(key)} />
              <span className="atlas-sound-track__name">{name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The list as it really plays, what plays marked in it: moved by a drag or Alt with up and down, on from a press, emptied of what's coming. */
export function TrackList({ director }: { director: SoundDirector }): React.JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  const movedRef = useRef<HTMLElement | null>(null);
  const view = useListView(director, leftRef);
  const waiting = useSoundValue(director, ({ mix }) => mix.waitingMusic?.tracks ?? NO_WAITING);
  const shuffled = useSoundValue(director, ({ mix }) => (mix.listChange ?? mix.table.music)?.shuffle ?? false);
  const stopAfter = useSoundValue(director, ({ mix }) => mix.stopAfter !== null);
  const playing = useSoundValue(director, ({ mix }) => mix.table.music !== null);
  const move = useCallback((track: SoundInfo, index: number) => director.desk.moveTrack(track.key, index), [director]);
  const drag = useListDrag(listRef, view.tracks, { idOf: trackKey, selector: '.atlas-sound-track[data-track]', canMove: canMoveAny, onDrop: move, scrollerRef });
  const menu = useContextMenu();
  const openMenu = useCallback((track: SoundInfo, anchor: HTMLElement, at?: { x: number; y: number }): void => {
    const index = view.tracks.findIndex((one) => one.key === track.key);
    const name = director.shelf.recordOfKey(track.key)?.name ?? '';
    const box = anchor.getBoundingClientRect();
    // Focus comes back to the row's own menu button, which a move keeps in view.
    const returnTo = anchor.closest('[data-track]')?.querySelector<HTMLElement>('.atlas-sound-track__menu') ?? anchor;
    const moveTo = (to: number): void => {
      movedRef.current = returnTo;
      director.desk.moveTrack(track.key, to);
    };
    menu.open([
      { type: 'item', label: t('audio.moveUp'), detail: SOUND_KEYS.moveUp, disabled: shuffled || index <= 0, onClick: () => moveTo(index - 1) },
      { type: 'item', label: t('audio.moveDown'), detail: SOUND_KEYS.moveDown, disabled: shuffled || index < 0 || index >= view.tracks.length - 1, onClick: () => moveTo(index + 1) },
      { type: 'item', label: t('audio.remove', { name }), destructive: true, onClick: () => director.desk.removeTrack(track.key) },
    ], at ?? { x: box.left, y: box.bottom }, { returnFocus: returnTo, label: t('audio.trackMenu', { name }) });
  }, [director, menu, shuffled, view.tracks]);

  const dragging = useRef(false);
  dragging.current = drag.draggingId !== null;

  // The list follows what plays, unless a drag holds it. Only when the track changes, or a scroll of the GM's would be undone.
  useEffect(() => {
    const row = view.current === null ? null : listRef.current?.querySelector(`[data-track="${CSS.escape(view.current)}"]`);
    if (row && scrollerRef.current && !dragging.current) scrollWithin(scrollerRef.current, row, 'nearest', 1);
  }, [view.current]);

  // A moved row is moved in the document, which takes focus off it.
  useLayoutEffect(() => {
    const moved = movedRef.current;
    movedRef.current = null;
    if (!moved) return;
    moved.focus({ preventScroll: true });
    if (scrollerRef.current) scrollWithin(scrollerRef.current, moved, 'nearest');
  }, [view.tracks]);

  const moveByKey = (event: React.KeyboardEvent<HTMLUListElement>): void => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-track]');
    // The menu key, or Shift+F10, opens the focused row's menu, as a right-click does.
    if (row && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
      const track = view.tracks.find((one) => one.key === row.dataset.track);
      if (!track) return;
      event.preventDefault();
      event.stopPropagation();
      openMenu(track, row.querySelector<HTMLElement>('.atlas-sound-track__menu') ?? row);
      return;
    }
    if (!event.altKey || shuffled || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const target = event.target as HTMLElement;
    const key = target.closest<HTMLElement>('[data-track]')?.dataset.track;
    const from = view.tracks.findIndex((track) => track.key === key);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || !key || !view.tracks[to]) return;
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = target;
    director.desk.moveTrack(key, to);
  };

  return (
    <div className="atlas-sound-queue" ref={scrollerRef}>
      <div className="atlas-sound-queue__head">
        <span className="atlas-sound-queue__left" ref={leftRef} />
        {/* In words, where the list is: as a glyph among the transport's it read as Stop. */}
        <button type="button" className="atlas-sound-queue__stop" aria-pressed={stopAfter} disabled={!playing} onClick={() => director.desk.setStopAfter(!stopAfter)}>
          {stopAfter && <Check aria-hidden="true" />}
          {t('audio.stopAfter')}
        </button>
        <IconAction label={t('audio.clearComing')} icon={ListX} disabled={view.tracks.length < 2 && waiting.length === 0} onClick={() => director.desk.clearComing()} />
      </div>
      <ul className="atlas-sound-tracks" ref={listRef} onKeyDown={moveByKey}>
        {drag.shown.map((track) => (
          <TrackRow key={track.key} director={director} track={track} current={track.key === view.current} movable={!shuffled} dragging={track.key === drag.draggingId} onDragStart={drag.start} onMenu={openMenu} />
        ))}
        {waiting.map((id) => {
          const name = director.shelf.recordOf(id)?.name ?? '';
          return (
            <li key={id} className="atlas-sound-track" data-waiting="true">
              <span className="atlas-sound-track__waiting">{t('audio.waiting')}</span>
              <span className="atlas-sound-track__name">{name}</span>
              <IconAction label={t('audio.remove', { name })} icon={X} className="atlas-sound-track__remove" onClick={() => director.desk.removeWaitingTrack(id)} />
            </li>
          );
        })}
      </ul>
      <PlayedTracks director={director} current={view.current} />
    </div>
  );
}
