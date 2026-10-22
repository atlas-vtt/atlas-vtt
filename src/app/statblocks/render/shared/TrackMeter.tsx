import React from 'react';
import { t } from '../../../i18n';
import type { ResourceValue } from '../../../resources/resourceTypes';
import type { TrackBlock } from '../../model/templateTypes';
import { MAX_TRACK_BOXES } from '../values/trackBoxes';

type TrackStyle = React.CSSProperties & Record<`--${string}`, string | number>;

/** What a press on the box at `index` sets: the boxes up to it, or one fewer where it is the last one marked. */
export const valueAfterBox = (marked: number, index: number): number => (marked === index + 1 ? index : index + 1);

/** Whether the track draws boxes, which a press sets, rather than a gauge, which − and + step. */
export const drawsBoxes = (value: ResourceValue, look: TrackBlock['look']): boolean => look === 'boxes' && value.max <= MAX_TRACK_BOXES;

interface TrackMeterProps {
  value: ResourceValue;
  look: TrackBlock['look'];
  /** Names the track's boxes and meter. */
  label: string;
  labelId: string;
  /** Sets the current value from a press on a box. Unset: the track is only shown. */
  onSet?: ((current: number) => void) | undefined;
}

function Boxes({ value, label, labelId, onSet }: Omit<TrackMeterProps, 'look'>): React.JSX.Element {
  const marked = Math.max(0, Math.min(value.current, value.max));
  const look = (index: number): string => (index < marked ? 'atlas-sb-track-box is-marked' : 'atlas-sb-track-box');
  if (!onSet) {
    return (
      <span className="atlas-sb-track-boxes" role="meter" aria-labelledby={labelId}
        aria-valuemin={0} aria-valuemax={value.max} aria-valuenow={marked}>
        {Array.from({ length: value.max }, (_, index) => <span key={index} className={look(index)} />)}
      </span>
    );
  }
  return (
    <span className="atlas-sb-track-boxes atlas-sb-track-boxes--live" role="group" aria-labelledby={labelId}>
      {Array.from({ length: value.max }, (_, index) => (
        <button key={index} type="button" className={look(index)} aria-pressed={index < marked}
          aria-label={t('statblock.pip', { label, n: index + 1, max: value.max })}
          onClick={() => onSet(valueAfterBox(marked, index))} />
      ))}
    </span>
  );
}

function Gauge({ value, labelId }: Pick<TrackMeterProps, 'value' | 'labelId'>): React.JSX.Element {
  const share = value.max > 0 ? Math.max(0, Math.min(1, value.current / value.max)) : 0;
  const style: TrackStyle = { '--atlas-sb-gauge-share': share };
  return (
    <span className="atlas-sb-gauge">
      <span className="atlas-sb-gauge-track" role="meter" aria-labelledby={labelId}
        aria-valuemin={0} aria-valuemax={value.max} aria-valuenow={value.current}>
        <span className="atlas-sb-gauge-fill" style={style} />
      </span>
      <span className="atlas-sb-gauge-value">{value.current} / {value.max}</span>
    </span>
  );
}

/** A track's boxes, pressable where `onSet` is given, or its gauge where it asks for one or has more boxes than a track draws. */
export function TrackMeter({ value, look, label, labelId, onSet }: TrackMeterProps): React.JSX.Element {
  return drawsBoxes(value, look)
    ? <Boxes value={value} label={label} labelId={labelId} onSet={onSet} />
    : <Gauge value={value} labelId={labelId} />;
}
