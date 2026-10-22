import React, { useContext, useId } from 'react';
import type { ResourceValue } from '../../../resources/resourceTypes';
import type { TrackBlock } from '../../model/templateTypes';
import { numericValue } from '../../values/numberText';
import { valueMisfit } from '../../values/valueFit';
import { valueText } from '../../values/valueText';
import { useSheet } from '../sheetContext';
import type { SheetState } from '../sheetState';
import { LabelledLine } from '../values/LabelledLine';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueEditingContext, ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';
import { TrackMeter } from '../shared/TrackMeter';
import { trackedShown } from '../values/trackedShown';

/**
 * The value the track shows: the token's, where the statblock is shown for a
 * token that holds the resource or the tracked number; else where it starts,
 * full when it counts down and empty when it counts up. It is drawn in the
 * theme's accent, as the rest of the card is, never in the resource's colour
 * on the map.
 */
function trackValue(block: TrackBlock, sheet: SheetState): ResourceValue | null {
  const held = block.resource ? sheet.token?.resources?.[block.resource] : undefined;
  if (held && held.max > 0) return held;
  const tracked = trackedShown(block.field, sheet);
  if (tracked) return { ...tracked, current: block.counts === sheet.tracked.get(block.field)?.counts ? tracked.current : tracked.max - tracked.current };
  const max = numericValue(sheet.reader(block.field));
  if (max === null || max <= 0) return null;
  const whole = Math.floor(max);
  return { current: block.counts === 'down' ? whole : 0, max: whole };
}

/**
 * The resource the track shows the token's value of, which the surface may set (`ValueEditing.track`): the
 * resource it is bound to, where the token holds it, else its tracked number, where it counts the way the number
 * counts. Null where it shows only where it starts.
 */
function ownKey(block: TrackBlock, sheet: SheetState): string | null {
  if (block.resource && sheet.token?.resources?.[block.resource]) return block.resource;
  const tracked = sheet.tracked.get(block.field);
  return tracked && trackedShown(block.field, sheet) !== null && block.counts === tracked.counts ? tracked.key : null;
}

/**
 * A count of boxes or a gauge: the statblock's maximum, and with a token its current value. Where the surface sets
 * the token's value (beside a player character's note), the maximum stands before the track as a value of its own,
 * edited as any value is, and the track sets the current value.
 */
export function TrackView({ block, display }: BlockViewProps<TrackBlock>): React.JSX.Element | null {
  const { state } = useSheet();
  const editing = useContext(ValueEditingContext);
  const labelId = useId();
  const label = block.label ?? state.fields.get(block.field)?.label ?? block.field;
  const track = display.state === 'value' ? trackValue(block, state) : null;
  // A value that is no count (its field's type changed) shows as it is written; nothing to count hides the block.
  const field = state.fields.get(block.field);
  const value = state.reader(block.field);
  const raw = display.state === 'value' && !track && field !== undefined && valueMisfit(field, value) !== null;
  if (display.state === 'value' && !track && !raw) return null;

  const own = track ? ownKey(block, state) : null;
  if (track && own !== null && editing?.track) {
    // A tracked number whose maximum another field holds is filled in there
    const tracked = state.tracked.get(block.field);
    const maxHere = !tracked || tracked.maxField === block.field;
    return (
      <LabelledLine label={label} className="atlas-sb-track" labelId={labelId}>
        {maxHere && (
          <ValueSlot block={block}>
            <span className="atlas-sb-value atlas-sb-track-max">{valueText(value) || track.max}</span>
          </ValueSlot>
        )}
        <span className="atlas-sb-track-value">{editing.track(own, label, track, block.look, labelId)}</span>
      </LabelledLine>
    );
  }
  return (
    <LabelledLine label={label} className="atlas-sb-track" labelId={labelId}>
      <ValueSlot block={block}>
        {track && (
          <span className="atlas-sb-track-value">
            <TrackMeter value={track} look={block.look} label={label} labelId={labelId} />
          </span>
        )}
        {raw && <ValueText shown={{ text: valueText(value), problems: [] }} />}
        {display.state !== 'value' && <StandIn display={display} />}
      </ValueSlot>
    </LabelledLine>
  );
}
