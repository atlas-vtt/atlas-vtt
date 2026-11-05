import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { t } from '../../../../i18n';
import { CHANNEL_DB_RANGE } from '../../../../services/soundSettings';
import { MOTION_EASE_OUT, prefersReducedMotion } from '../../../../utils/motion';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { IconAction } from './IconAction';
import { faderDb, faderPosition } from './faderScale';
import { MeterBoard } from './meterBoard';

export const MeterBoardContext = createContext<MeterBoard>(new MeterBoard());

interface VerticalFaderProps {
  /** Names it for screen readers. */
  label: string;
  value: number;
  /** The strip whose level shows inside the track. */
  meter: string;
  onChange: (db: number) => void;
  /** The release, or the key let go. */
  onCommit?: (db: number) => void;
}

const { min: MIN_DB, max: MAX_DB } = CHANNEL_DB_RANGE;
const STEP_DB = 1;
const PAGE_DB = 6;
/** Where every strip starts: what a sound's own loudness was evened out to. */
const RESET_DB = 0;
const RESET_TURN_MS = 300;

/** With Shift held, a drag moves the level this many times more slowly. */
const FINE_DRAG = 0.25;

const clampDb = (db: number): number => Math.max(MIN_DB, Math.min(MAX_DB, db));
/** How far down the rail a level lies (the stylesheet's share from the top). */
const shareOf = (db: number): number => 1 - faderPosition(db);
/** Levels from a drag land on half decibels. */
const halfDb = (db: number): number => clampDb(Math.round(db * 2) / 2);

function formatDb(db: number): string {
  const rounded = Math.round(db);
  let sign = '';
  if (rounded < 0) sign = '−';
  if (rounded > 0) sign = '+';
  return t('audio.dbValue', { value: `${sign}${Math.abs(rounded)}` });
}

function keyedDb(event: React.KeyboardEvent, db: number): number | null {
  switch (event.key) {
    case 'ArrowUp': return db + STEP_DB;
    case 'ArrowDown': return db - STEP_DB;
    case 'PageUp': return db + PAGE_DB;
    case 'PageDown': return db - PAGE_DB;
    case 'Home': return MAX_DB;
    case 'End': return MIN_DB;
    default: return null;
  }
}

/** The level inside a fader's track, drawn by the page's meter loop. */
function StripMeter({ strip }: { strip: string }): React.JSX.Element {
  const board = useContext(MeterBoardContext);
  const fill = useRef<HTMLElement>(null);
  useEffect(() => (fill.current ? board.add(fill.current, strip) : undefined), [board, strip]);
  return <div className="atlas-sound-meter"><i ref={fill} /></div>;
}

/**
 * A fader in dB, up and down: a drag or a key goes straight to the gain and only this fader draws it.
 * Pressing the track moves the thumb there; pressing the thumb keeps it under the pointer.
 */
export const VerticalFader = React.memo(function VerticalFader({ label, value, meter, onChange, onCommit }: VerticalFaderProps): React.JSX.Element {
  const [held, setHeld] = useState<number | null>(null);
  const shown = held ?? value;
  const endDrag = useRef<(() => void) | null>(null);

  // A page that goes mid-drag takes the release with it; what the fader was set to still counts.
  useEffect(() => () => endDrag.current?.(), []);

  const press = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const track = event.currentTarget;
    const thumb = track.querySelector<HTMLElement>('[role="slider"]');
    thumb?.focus();
    const box = track.getBoundingClientRect();
    const thumbBox = thumb?.getBoundingClientRect();
    const onThumb = thumbBox !== undefined && event.clientY >= thumbBox.top && event.clientY <= thumbBox.bottom;
    const grab = onThumb ? event.clientY - (thumbBox.top + thumbBox.height / 2) : 0;
    // The pointer's travel moves the position on the rail (the taper), Shift a quarter as far: from where Shift last changed.
    let anchorY = event.clientY;
    let anchorAt = onThumb ? faderPosition(shown) : 1 - (event.clientY - grab - box.top) / box.height;
    let fine = event.shiftKey;
    let current = onThumb ? shown : halfDb(faderDb(anchorAt));
    track.setPointerCapture(event.pointerId);
    setHeld(current);
    if (!onThumb) onChange(current);
    const positionAt = (clientY: number): number => anchorAt + ((anchorY - clientY) / box.height) * (fine ? FINE_DRAG : 1);
    const move = (moved: PointerEvent): void => {
      if (moved.shiftKey !== fine) {
        anchorAt = Math.max(0, Math.min(1, positionAt(moved.clientY)));
        anchorY = moved.clientY;
        fine = moved.shiftKey;
      }
      const db = halfDb(faderDb(positionAt(moved.clientY)));
      if (db === current) return;
      current = db;
      setHeld(db);
      onChange(db);
    };
    const end = (): void => {
      endDrag.current = null;
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', end);
      track.removeEventListener('pointercancel', end);
      track.removeEventListener('lostpointercapture', end);
      setHeld(null);
      onCommit?.(current);
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    track.addEventListener('lostpointercapture', end);
    endDrag.current = end;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = keyedDb(event, Math.round(shown));
    if (next === null) return;
    event.preventDefault();
    const db = clampDb(next);
    setHeld(db);
    onChange(db);
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (held === null || keyedDb(event, 0) === null) return;
    setHeld(null);
    onCommit?.(held);
  };

  const reset = (event: React.MouseEvent<HTMLButtonElement>): void => {
    onChange(RESET_DB);
    onCommit?.(RESET_DB);
    const icon = event.currentTarget.querySelector('svg');
    if (icon && !prefersReducedMotion(icon)) icon.animate([{ rotate: '0deg' }, { rotate: '-360deg' }], { duration: RESET_TURN_MS, easing: MOTION_EASE_OUT });
  };

  return (
    <>
      <div className="atlas-sound-fader" onPointerDown={press}>
        <StripMeter strip={meter} />
        <div className="atlas-sound-fader__rail" data-held={held !== null || undefined} style={{ '--atlas-sound-fader-at': shareOf(shown) } as React.CSSProperties}>
          {/* Says how to trim finely where the pointer is, and keeps out of the way while it drags. */}
          <LabelTooltip label={t('audio.fineFader')} side="right" suppressed={held !== null} describe>
            <div
              className="atlas-sound-fader__thumb"
              role="slider"
              tabIndex={0}
              aria-label={label}
              aria-orientation="vertical"
              aria-valuemin={MIN_DB}
              aria-valuemax={MAX_DB}
              aria-valuenow={Math.round(shown)}
              aria-valuetext={formatDb(shown)}
              onKeyDown={onKeyDown}
              onKeyUp={onKeyUp}
            />
          </LabelTooltip>
        </div>
      </div>
      <div className="atlas-sound-fader__foot">
        <div className="atlas-sound-fader__value">{formatDb(shown)}</div>
        <IconAction label={t('audio.resetLevel')} icon={RotateCcw} className="atlas-sound-fader__reset" side="bottom" focusSkip disabled={shown === RESET_DB} onClick={reset} />
      </div>
    </>
  );
});
