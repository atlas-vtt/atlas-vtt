import React, { useMemo, useState } from 'react';
import type { RangeFacet as RangeFacetData } from '../../../../../creatures/creatureFilterEngine';
import { formatRange, formatRating } from '../../../../../creatures/creatureValues';
import type { NumericRange } from '../../../../../types/creatureFilterTypes';
import { Slider } from '../../../primitives/slider';
import { FilterSection } from './FilterSection';
import { RangeBoundInput } from './RangeBoundInput';
import { t } from '../../../../../i18n';

interface RangeFilterProps {
  facet: RangeFacetData;
  /** Sets the bounds; null when they span every value, so the filter stops filtering. */
  onChange: (range: NumericRange | null) => void;
}

/** Histogram bars at most; more values share a bar. */
const MAX_BARS = 24;

type Thumbs = [number, number];

/** Index of the first value at or above `bound` (for the lower thumb) or the last at or below it (upper thumb). */
function indexOf(values: readonly number[], bound: number, edge: 'min' | 'max'): number {
  if (edge === 'min') {
    const index = values.findIndex((value) => value >= bound);
    return index < 0 ? values.length - 1 : index;
  }
  for (let i = values.length - 1; i >= 0; i--) if (values[i]! <= bound) return i;
  return 0;
}

/**
 * A scale such as CR: bars show how many tokens have each value, the slider
 * steps through exactly those values, and its two ends are fields to type a
 * bound into, which snaps to the nearest value the tokens have. The list
 * follows on release, so dragging does not refilter at every step.
 */
export function RangeFilter({ facet, onChange }: RangeFilterProps): React.JSX.Element | null {
  const values = useMemo(() => facet.values.map((entry) => entry.value), [facet.values]);
  const last = values.length - 1;
  const committed: Thumbs = facet.selected
    ? [indexOf(values, facet.selected.min, 'min'), indexOf(values, facet.selected.max, 'max')]
    : [0, last];
  const [dragging, setDragging] = useState<Thumbs | null>(null);
  const [low, high] = dragging ?? committed;

  const bars = useMemo(() => {
    const perBar = Math.ceil(facet.values.length / MAX_BARS);
    const result: Array<{ from: number; to: number; count: number }> = [];
    for (let start = 0; start < facet.values.length; start += perBar) {
      const group = facet.values.slice(start, start + perBar);
      result.push({ from: start, to: start + group.length - 1, count: group.reduce((sum, entry) => sum + entry.count, 0) });
    }
    return result;
  }, [facet.values]);
  const tallest = Math.max(1, ...bars.map((bar) => bar.count));

  if (values.length < 2 && !facet.selected) return null;
  const { label } = facet.definition;
  const summary = dragging
    ? formatRange({ min: values[low]!, max: values[high]! })
    : facet.selected ? formatRange(facet.selected) : undefined;

  const commit = ([from, to]: number[]): void => {
    setDragging(null);
    const min = values[from ?? 0];
    const max = values[to ?? last];
    if (min === undefined || max === undefined) return;
    onChange(from === 0 && to === last ? null : { min, max });
  };
  // A typed lower bound above the upper one moves the upper with it, and the other way round.
  const commitLow = (bound: number): void => {
    const from = indexOf(values, bound, 'min');
    commit([from, Math.max(from, high)]);
  };
  const commitHigh = (bound: number): void => {
    const to = indexOf(values, bound, 'max');
    commit([Math.min(low, to), to]);
  };

  return (
    <FilterSection title={label} summary={summary} active={Boolean(facet.selected)}>
      <div className="atlas-filter-range">
        <div className="atlas-filter-range__bars" aria-hidden="true">
          {bars.map((bar) => (
            <span
              key={bar.from}
              className={`atlas-filter-range__bar${bar.to >= low && bar.from <= high ? ' atlas-in-range' : ''}`}
              style={{ '--atlas-bar-height': `${Math.max(bar.count > 0 ? 8 : 0, (bar.count / tallest) * 100)}%` } as React.CSSProperties}
            />
          ))}
        </div>
        {values.length >= 2 && (
          <Slider
            className="atlas-filter-range__slider"
            min={0}
            max={last}
            step={1}
            minStepsBetweenThumbs={0}
            value={[low, high]}
            onValueChange={(next) => setDragging([next[0] ?? 0, next[1] ?? last])}
            onValueCommit={commit}
            thumbLabels={[t('filters.lowest', { label }), t('filters.highest', { label })]}
            getValueText={(index) => formatRating(values[index] ?? 0)}
          />
        )}
        <div className="atlas-filter-range__ends">
          <RangeBoundInput value={values[low] ?? 0} label={t('filters.lowest', { label })} align="start" onCommit={commitLow} />
          <RangeBoundInput value={values[high] ?? 0} label={t('filters.highest', { label })} align="end" onCommit={commitHigh} />
        </div>
      </div>
    </FilterSection>
  );
}
