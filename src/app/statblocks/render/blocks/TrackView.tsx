import React, { useId } from 'react';
import type { ResourceValue } from '../../../resources/resourceTypes';
import type { TrackBlock } from '../../model/templateTypes';
import { numericValue } from '../../values/numberText';
import { valueMisfit } from '../../values/valueFit';
import { valueText } from '../../values/valueText';
import { useSheet } from '../sheetContext';
import type { SheetState } from '../sheetState';
import { LabelledLine } from '../values/LabelledLine';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';
import { MAX_TRACK_BOXES } from '../values/trackBoxes';


type TrackStyle = React.CSSProperties & Record<`--${string}`, string | number>;

/**
 * The value the track shows: the token's, where the statblock is shown for a
 * token that holds the resource; else where it starts, full when it counts
 * down and empty when it counts up. It is drawn in the theme's accent, as the
 * rest of the card is, never in the resource's colour on the map.
 */
function trackValue(block: TrackBlock, sheet: SheetState): ResourceValue | null {
  const held = block.resource ? sheet.token?.resources?.[block.resource] : undefined;
  if (held && held.max > 0) return held;
  const max = numericValue(sheet.reader(block.field));
  if (max === null || max <= 0) return null;
  const whole = Math.floor(max);
  return { current: block.counts === 'down' ? whole : 0, max: whole };
}

function Boxes({ value, labelId }: { value: ResourceValue; labelId: string }): React.JSX.Element {
  const marked = Math.max(0, Math.min(value.current, value.max));
  return (
    <span className="atlas-sb-track-boxes" role="meter" aria-labelledby={labelId}
      aria-valuemin={0} aria-valuemax={value.max} aria-valuenow={marked}>
      {Array.from({ length: value.max }, (_, index) => (
        <span key={index} className={index < marked ? 'atlas-sb-track-box is-marked' : 'atlas-sb-track-box'} />
      ))}
    </span>
  );
}

function Gauge({ value, labelId }: { value: ResourceValue; labelId: string }): React.JSX.Element {
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

/** A count of boxes or a gauge: the statblock's maximum, and with a token its current value. */
export function TrackView({ block, display }: BlockViewProps<TrackBlock>): React.JSX.Element | null {
  const { state } = useSheet();
  const labelId = useId();
  const label = block.label ?? state.fields.get(block.field)?.label ?? block.field;
  const track = display.state === 'value' ? trackValue(block, state) : null;
  // A value that is no count (its field's type changed) shows as it is written; nothing to count hides the block.
  const field = state.fields.get(block.field);
  const value = state.reader(block.field);
  const raw = display.state === 'value' && !track && field !== undefined && valueMisfit(field, value) !== null;
  if (display.state === 'value' && !track && !raw) return null;

  const boxes = block.look === 'boxes' && (track?.max ?? 0) <= MAX_TRACK_BOXES;
  return (
    <LabelledLine label={label} className="atlas-sb-track" labelId={labelId}>
      <ValueSlot block={block}>
        {track && (
          <span className="atlas-sb-track-value">
            {boxes ? <Boxes value={track} labelId={labelId} /> : <Gauge value={track} labelId={labelId} />}
          </span>
        )}
        {raw && <ValueText shown={{ text: valueText(value), problems: [] }} />}
        {display.state !== 'value' && <StandIn display={display} />}
      </ValueSlot>
    </LabelledLine>
  );
}
