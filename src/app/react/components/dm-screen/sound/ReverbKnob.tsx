import React, { useEffect, useRef, useState } from 'react';
import { Waves } from 'lucide-react';
import { t } from '../../../../i18n';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';

interface ReverbKnobProps {
  /** The strip's name, for screen readers. */
  name: string;
  /** The room it sends to, named in the tooltip. */
  room: string;
  /** 0 to 1. */
  value: number;
  onChange: (amount: number) => void;
  disabled?: boolean;
}

/** A drag this far, up or down, turns the knob from dry to all the way; Shift turns it a quarter as fast. */
const DRAG_PX = 160;
const FINE = 0.25;
const STEP = 0.05;
const PAGE = 0.25;
/** The arc the knob turns through, open at the bottom as on a mixing desk. */
const SWEEP_DEG = 270;
const RADIUS = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC = (CIRCUMFERENCE * SWEEP_DEG) / 360;

const clamp = (amount: number): number => Math.max(0, Math.min(1, Math.round(amount * 100) / 100));
const percent = (amount: number): number => Math.round(amount * 100);

function keyed(event: React.KeyboardEvent, amount: number): number | null {
  switch (event.key) {
    case 'ArrowUp': return amount + STEP;
    case 'ArrowDown': return amount - STEP;
    case 'PageUp': return amount + PAGE;
    case 'PageDown': return amount - PAGE;
    case 'Home': return 1;
    case 'End': return 0;
    default: return null;
  }
}

/**
 * How much of the room a strip carries, as a desk's send knob: drag up or down, Shift for fine steps,
 * double click for dry. The arc fills in the accent; a dry knob shows a wave in its middle, a wet one
 * its amount.
 */
export const ReverbKnob = React.memo(function ReverbKnob({ name, room, value, onChange, disabled = false }: ReverbKnobProps): React.JSX.Element {
  const [held, setHeld] = useState<number | null>(null);
  const shown = held ?? value;
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  const press = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || disabled) return;
    event.preventDefault();
    const knob = event.currentTarget;
    knob.focus();
    knob.setPointerCapture(event.pointerId);
    let lastY = event.clientY;
    let current = shown;
    setHeld(current);
    const move = (moved: PointerEvent): void => {
      const delta = ((lastY - moved.clientY) / DRAG_PX) * (moved.shiftKey ? FINE : 1);
      lastY = moved.clientY;
      // Kept unrounded while dragging, so slow fine steps still add up.
      current = Math.max(0, Math.min(1, current + delta));
      const next = clamp(current);
      setHeld(next);
      if (next !== clamp(value)) onChange(next);
    };
    const end = (): void => {
      endDrag.current = null;
      knob.removeEventListener('pointermove', move);
      knob.removeEventListener('pointerup', end);
      knob.removeEventListener('pointercancel', end);
      knob.removeEventListener('lostpointercapture', end);
      setHeld(null);
    };
    knob.addEventListener('pointermove', move);
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
    knob.addEventListener('lostpointercapture', end);
    endDrag.current = end;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || disabled) return;
    const next = keyed(event, shown);
    if (next === null) return;
    event.preventDefault();
    onChange(clamp(next));
  };

  const filled = ARC * shown;
  return (
    <LabelTooltip label={t('audio.reverb.tooltip', { room, value: percent(shown) })} describe suppressed={held !== null}>
      <div
        className="atlas-sound-knob"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('audio.reverb.of', { name })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent(shown)}
        aria-valuetext={t('audio.reverb.valueIn', { room, value: percent(shown) })}
        aria-disabled={disabled || undefined}
        data-held={held !== null || undefined}
        data-wet={shown > 0 || undefined}
        onPointerDown={press}
        onKeyDown={onKeyDown}
        onDoubleClick={() => { if (!disabled) onChange(0); }}
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle className="atlas-sound-knob__track" cx="16" cy="16" r={RADIUS} strokeDasharray={`${ARC} ${CIRCUMFERENCE}`} />
          {/* A round cap draws a dot even at no length, so a dry knob has no fill at all. */}
          {shown > 0 && <circle className="atlas-sound-knob__fill" cx="16" cy="16" r={RADIUS} strokeDasharray={`${filled} ${CIRCUMFERENCE}`} />}
        </svg>
        <span className="atlas-sound-knob__value" aria-hidden="true">{shown > 0 ? percent(shown) : <Waves />}</span>
      </div>
    </LabelTooltip>
  );
});
