import React, { useCallback, useId, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { GripVertical, X } from 'lucide-react';
import { getLocale, t } from '../../../i18n';
import { musicTotals } from '../../../packages/components/asset-manager/collection-transfer/MusicReviewDialog';
import { LabelTooltip, TooltipProvider } from '../../../packages/components/primitives/tooltip';
import { formatLength } from '../../../react/components/dm-screen/sound/library/rowModel';
import { useListDrag } from '../../../react/components/dm-screen/sound/useListDrag';
import { MAX_ALBUM_TRACKS, MAX_MUSIC_TEXT } from '../../../services/musicBundle/musicBundleFormat';
import type { MusicShareSession } from '../../upload/MusicShareSession';
import type { MusicShareSnapshot, MusicShareTrack, TrackCopyState, TrackRefusal } from '../../upload/musicShareState';
import { MusicProblem, musicProblemText } from './MusicProblem';
import { ShareNotice } from './ShareNotice';

const percent = new Intl.NumberFormat(getLocale(), { style: 'percent', maximumFractionDigits: 0 });
const idOf = (track: MusicShareTrack): string => track.id;

/** Why a track cannot go, in a few words. */
export function trackRefusalText(reason: TrackRefusal): string {
  if (reason === 'consent' || reason === 'gone') return t(`armariumMusic.refused.${reason}`);
  return t(`audio.refused.${reason}`);
}

/** Where a track's copy stands, as its row says it. */
function stateText(copy: TrackCopyState): string {
  switch (copy.state) {
    case 'reading': return t('armariumMusic.state.reading');
    case 'converting': return copy.progress === null ? t('armariumMusic.state.waiting') : t('armariumMusic.state.converting', { percent: percent.format(copy.progress) });
    case 'ready': return formatLength(copy.seconds);
    case 'refused': return t('armariumMusic.state.refused');
  }
}

/** Each track's number in what is uploaded: the tracks that cannot go are left out of the count, as the packer leaves them out. */
function uploadNumbers(tracks: readonly MusicShareTrack[]): Map<string, number> {
  const going = tracks.filter((track) => track.copy.state !== 'refused');
  return new Map(going.map((track, index) => [track.id, index + 1]));
}

interface RowProps {
  track: MusicShareTrack;
  /** Null for a track that cannot go. */
  number: number | null;
  /** A single's title is the share's name, edited above. */
  title: string | null;
  movable: boolean;
  removable: boolean;
  dragging: boolean;
  invalid: boolean;
  session: MusicShareSession;
  onDragStart: (track: MusicShareTrack, event: ReactPointerEvent<HTMLElement>) => void;
}

function TrackRow({ track, number, title, movable, removable, dragging, invalid, session, onDragStart }: RowProps): React.JSX.Element {
  const shown = title ?? track.title;
  const state = <span className="atlas-music-track__state">{stateText(track.copy)}</span>;
  return (
    <li className="atlas-music-track" data-track={track.id} data-state={track.copy.state} data-dragging={dragging || undefined}>
      {movable && (
        <LabelTooltip label={t('armariumMusic.move')} hint={t('armariumMusic.moveHint')} suppressed={dragging} describe>
          <button type="button" className="atlas-music-track__grip" aria-label={t('armariumMusic.moveTrack', { title: shown })} onPointerDown={(event) => onDragStart(track, event)}>
            <GripVertical aria-hidden="true" />
          </button>
        </LabelTooltip>
      )}
      <span className="atlas-music-track__number" aria-hidden="true">{number ?? ''}</span>
      {title === null ? (
        <input
          className="atlas-input atlas-music-track__input"
          value={track.title}
          maxLength={MAX_MUSIC_TEXT * 2}
          aria-label={number === null ? track.title : t('armariumMusic.trackTitle', { number })}
          aria-invalid={invalid || undefined}
          disabled={track.copy.state === 'refused'}
          onChange={(event) => session.setTitle(track.id, event.target.value)}
        />
      ) : <span className="atlas-music-track__title">{title}</span>}
      {track.copy.state === 'refused' ? <LabelTooltip label={trackRefusalText(track.copy.reason)} multiline describe>{state}</LabelTooltip> : state}
      {removable && (
        <LabelTooltip label={t('armariumMusic.leaveOut')} describe>
          <button type="button" className="atlas-music-track__remove" aria-label={t('armariumMusic.leaveOutTrack', { title: shown })} onClick={() => session.removeTrack(track.id)}>
            <X aria-hidden="true" />
          </button>
        </LabelTooltip>
      )}
    </li>
  );
}

/**
 * The share's tracks in the order they play: dragged by their grip, or moved with Alt and the arrow keys; an album's
 * titles edited in place; a track left out with its ×. Tracks that cannot go are named under the list. The list
 * scrolls inside itself, so a long album never moves the dialog.
 */
export function MusicTrackList({ snapshot, session }: { snapshot: MusicShareSnapshot; session: MusicShareSession }): React.JSX.Element {
  const labelId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const movedRef = useRef<HTMLElement | null>(null);
  const album = snapshot.kind === 'music-album';
  const movable = album && snapshot.tracks.length > 1;
  const removable = session.mayRemove();
  const move = useCallback((track: MusicShareTrack, index: number) => session.moveTrack(track.id, index), [session]);
  const canMove = useCallback(() => movable, [movable]);
  const drag = useListDrag(listRef, snapshot.tracks, { idOf, selector: '.atlas-music-track', canMove, onDrop: move, scrollerRef: listRef });

  // A row moved by its keys is moved in the document, which takes focus off it.
  useLayoutEffect(() => {
    const moved = movedRef.current;
    movedRef.current = null;
    moved?.focus({ preventScroll: true });
  }, [snapshot.tracks]);

  const moveByKey = (event: React.KeyboardEvent<HTMLOListElement>): void => {
    if (!movable || !event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const target = event.target as HTMLElement;
    const id = target.closest<HTMLElement>('[data-track]')?.dataset.track;
    const from = snapshot.tracks.findIndex((track) => track.id === id);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || id === undefined || to < 0 || to >= snapshot.tracks.length) return;
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = target;
    session.moveTrack(id, to);
  };

  const ready = snapshot.tracks.flatMap((track) => (track.copy.state === 'ready' ? [track.copy] : []));
  const refused = snapshot.tracks.filter((track): track is MusicShareTrack & { copy: { state: 'refused'; reason: TrackRefusal } } => track.copy.state === 'refused');
  const titleProblemTrack = snapshot.tracks.find((track) => snapshot.problems[`title:${track.id}`] !== undefined);
  const numbers = uploadNumbers(drag.shown);
  const problemNumber = titleProblemTrack ? uploadNumbers(snapshot.tracks).get(titleProblemTrack.id) : undefined;
  return (
    <section className="atlas-share-field atlas-music-share__tracks" aria-labelledby={labelId}>
      <div className="atlas-music-share__tracks-head">
        <span id={labelId} className="atlas-share-field__label">{t('armariumMusic.tracks')}</span>
        <span className="atlas-share-field__hint">{musicTotals(ready.length, ready.reduce((sum, copy) => sum + copy.seconds, 0), ready.reduce((sum, copy) => sum + copy.bytes, 0))}</span>
      </div>
      <TooltipProvider delayDuration={300} skipDelayDuration={600}>
        <ol ref={listRef} className="atlas-music-tracks" data-dragging={drag.draggingId !== null || undefined} aria-labelledby={labelId} onKeyDown={moveByKey}>
          {drag.shown.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              number={numbers.get(track.id) ?? null}
              title={album ? null : snapshot.name}
              movable={movable}
              removable={removable}
              dragging={track.id === drag.draggingId}
              invalid={snapshot.problems[`title:${track.id}`] !== undefined}
              session={session}
              onDragStart={drag.start}
            />
          ))}
        </ol>
      </TooltipProvider>
      {titleProblemTrack && (
        <p className="atlas-share-field__problem" role="alert">
          {t('armariumMusic.problem.title', { number: problemNumber ?? 0, problem: musicProblemText(snapshot.problems[`title:${titleProblemTrack.id}`] ?? '', snapshot.kind) })}
        </p>
      )}
      <MusicProblem id={`${labelId}-problem`} field="tracks" problems={snapshot.problems} kind={snapshot.kind} />
      {snapshot.cut > 0 && <ShareNotice tone="info">{t('armariumMusic.cut', { max: MAX_ALBUM_TRACKS })}</ShareNotice>}
      {refused.length > 0 && (
        <ShareNotice tone="info">
          <span>{t('armariumMusic.leftOut', { count: refused.length })}</span>
          <ul className="atlas-music-share__left-out">
            {refused.map((track) => <li key={track.id}>{t('armariumMusic.leftOutLine', { title: track.title, reason: trackRefusalText(track.copy.reason) })}</li>)}
          </ul>
        </ShareNotice>
      )}
    </section>
  );
}
