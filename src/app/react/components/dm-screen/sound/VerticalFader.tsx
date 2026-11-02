import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { t } from '../../../../i18n';
import { CHANNEL_DB_RANGE } from '../../../../services/soundSettings';
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

const clampDb = (db: number): number => Math.max(MIN_DB, Math.min(MAX_DB, db));
const shareOf = (db: number): number => (MAX_DB - clampDb(db)) / (MAX_DB - MIN_DB);

export function formatDb(db: number): string {
  const rounded = Math.round(db);
  return t('audio.dbValue', { value: `${rounded < 0 ? '−' : rounded > 0 ? '+' : ''}${Math.abs(rounded)}` });
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
  const trackRef = useRef<HTMLDivElement>(null);
  const shown = held ?? value;

  const press = (event: React.PointerEvent<HTMLDivElement>): void => {
    const track = trackRef.current;
    if (event.button !== 0 || !track) return;
    event.preventDefault();
    const element = event.currentTarget;
    const thumb = track.querySelector<HTMLElement>('[role="slider"]');
    thumb?.focus();
    const box = track.getBoundingClientRect();
    const thumbBox = thumb?.getBoundingClientRect();
    const onThumb = thumbBox !== undefined && event.clientY >= thumbBox.top && event.clientY <= thumbBox.bottom;
    const grab = onThumb && thumbBox ? event.clientY - (thumbBox.top + thumbBox.height / 2) : 0;
    const at = (clientY: number): number => Math.round((MAX_DB - ((clientY - grab - box.top) / box.height) * (MAX_DB - MIN_DB)) * 2) / 2;
    let current = clampDb(at(event.clientY));
    element.setPointerCapture(event.pointerId);
    if (!onThumb) {
      setHeld(current);
      onChange(current);
    } else {
      setHeld(shown);
      current = shown;
    }
    const move = (moved: PointerEvent): void => {
      const db = clampDb(at(moved.clientY));
      if (db === current) return;
      current = db;
      setHeld(db);
      onChange(db);
    };
    const end = (): void => {
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', end);
      element.removeEventListener('pointercancel', end);
      setHeld(null);
      onCommit?.(current);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', end);
    element.addEventListener('pointercancel', end);
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

  return (
    <>
      <div className="atlas-sound-fader" ref={trackRef} onPointerDown={press}>
        <StripMeter strip={meter} />
        <div className="atlas-sound-fader__rail" data-held={held !== null || undefined} style={{ '--atlas-sound-fader-at': shareOf(shown) } as React.CSSProperties}>
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
        </div>
      </div>
      <div className="atlas-sound-fader__value">{formatDb(shown)}</div>
    </>
  );
});
