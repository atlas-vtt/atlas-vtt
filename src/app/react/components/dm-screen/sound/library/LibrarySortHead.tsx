import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { t } from '../../../../../i18n';
import type { RowSort, RowSortKey } from '../../../../../soundLibrary/libraryPlace';
import { cn } from '../../../../../../utils/cn';

/** The ring's radius in a 12 px box: the stroke stays inside it. */
const RING_RADIUS = 4.5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

interface LibrarySortHeadProps {
  sort: RowSort;
  /** While a sort by length waits for the lengths, the share read so far. */
  reading: number | null;
  onSort: (by: RowSortKey) => void;
  /** Down from the head: the rows. */
  onDown: () => void;
  /** Up from the head: the search. */
  onUp: () => void;
}

/** A quiet ring that fills as the lengths come in: the rows are sorted once it is full. */
function ReadingRing({ share }: { share: number }): React.JSX.Element {
  const percent = Math.round(share * 100);
  return (
    <svg className="atlas-sound-lib__sort-ring" viewBox="0 0 12 12" role="progressbar" aria-label={t('audio.library.readingLengths')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <circle cx="6" cy="6" r={RING_RADIUS} className="atlas-sound-lib__sort-ring-track" />
      <circle cx="6" cy="6" r={RING_RADIUS} className="atlas-sound-lib__sort-ring-fill" strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - share)} />
    </svg>
  );
}

/** Each head, and the place of its column among the row's cells. */
const COLUMNS = [
  { by: 'name', label: 'audio.library.sortName', index: 2 },
  { by: 'length', label: 'audio.library.sortLength', index: 4 },
] as const;

/**
 * The heads of the rows' columns, over their columns: a press sorts by one, a second turns the order round. The mark
 * of the order stands on the side the column's text keeps clear (after a name, before a length), and is there,
 * unseen, on every head, so nothing moves when the sort does.
 */
export function LibrarySortHead({ sort, reading, onSort, onDown, onUp }: LibrarySortHeadProps): React.JSX.Element {
  const keys = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // Tab and Escape go on to the page; nothing else reaches the rows' keys, which act on the row in view.
    if (event.key === 'Tab' || event.key === 'Escape') return;
    event.stopPropagation();
    const heads = [...event.currentTarget.querySelectorAll('button')];
    const at = heads.findIndex((head) => head === event.target);
    const move = (to: number): void => {
      event.preventDefault();
      heads[(to + heads.length) % heads.length]?.focus();
    };
    if (event.key === 'ArrowRight') move(at + 1);
    else if (event.key === 'ArrowLeft') move(at - 1);
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onDown();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      onUp();
    }
  };
  return (
    <div role="row" aria-rowindex={1} className="atlas-sound-lib__colheads" onKeyDown={keys}>
      {COLUMNS.map(({ by, label, index }) => {
        const active = sort.by === by;
        const waiting = active && reading !== null;
        const Chevron = active && sort.descending ? ChevronDown : ChevronUp;
        const mark = waiting
          ? <ReadingRing share={reading} />
          : <Chevron className="atlas-sound-lib__sort-mark" aria-hidden="true" />;
        return (
          <div
            key={by}
            role="columnheader"
            aria-colindex={index}
            aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : undefined}
            aria-busy={waiting || undefined}
            className={cn('atlas-sound-lib__colhead', `atlas-sound-lib__colhead--${by}`)}
          >
            <button type="button" tabIndex={-1} className="atlas-sound-lib__sort" data-active={active || undefined} onClick={() => onSort(by)}>
              {by === 'length' && mark}
              <span className="atlas-sound-lib__sort-word">{t(label)}</span>
              {by === 'name' && mark}
            </button>
          </div>
        );
      })}
    </div>
  );
}
