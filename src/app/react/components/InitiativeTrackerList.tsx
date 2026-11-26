import React, { useId } from 'react';
import type { ListSegment } from '../../initiative/listSegments';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { t } from '../../i18n';
import { TURN_KEY_ATTRIBUTE } from '../../initiative/motion/turnMotion';
import type { RowDrag } from '../hooks/useRowDrag';

/** Marks a side the GM can drag by its heading (`sideDrag`); its value is the side's place among them. */
export const DRAGGED_SIDE_ATTRIBUTE = 'data-side-place';

interface InitiativeTrackerListProps {
  /** The list as it is drawn (`listSegments`). */
  segments: readonly ListSegment<InitiativeEntry>[];
  /** Draws a card of the segment `group` (its key); `inTurn` says it stands in the side whose turn it is. */
  card: (entry: InitiativeEntry, group: string, inTurn?: boolean) => React.ReactElement;
  /** Where set, each side is dragged by its heading to change the order the sides act in. */
  sideDrag?: RowDrag;
}

/**
 * The tracker's combatants: under their side in a fight by sides (with this round's roll where the
 * sides roll for their order), else in turn order, with
 * those that delayed their turn waiting below the order until they act. Where the list runs on
 * into the next round a divider names it. The cards of the order are siblings, so the turn and the
 * next ones can be scrolled into view together (`scrollWithin`).
 */
export const InitiativeTrackerList: React.FC<InitiativeTrackerListProps> = ({ segments, card, sideDrag }) => {
  const labelId = useId();
  let sidePlace = 0;

  return (
    <>
      {segments.map((segment) => {
        if (segment.kind === 'round') {
          const label = t('initiative.nextRound', { round: segment.round });
          return (
            <div key="round" className="atlas-initiative-round" role="separator" aria-label={label} {...{ [TURN_KEY_ATTRIBUTE]: `round:${segment.round}` }}>
              <span className="atlas-initiative-round__label" aria-hidden="true">{label}</span>
            </div>
          );
        }
        const label = segment.side ? segment.side.name : segment.delayed ? t('initiative.delayed') : null;
        if (label === null) return <React.Fragment key={segment.key}>{segment.items.map((entry) => card(entry, segment.key))}</React.Fragment>;
        const classes = [
          'atlas-initiative-side',
          segment.active && 'atlas-initiative-side--active',
          segment.delayed && 'atlas-initiative-side--delayed',
        ].filter(Boolean).join(' ');
        const place = sideDrag && segment.side ? sidePlace++ : null;
        const dragged = place !== null && sideDrag ? {
          section: {
            style: { translate: sideDrag.offsetOf(place) },
            'data-held': sideDrag.held === place ? '' : undefined,
            [DRAGGED_SIDE_ATTRIBUTE]: place,
          },
          label: {
            onPointerDown: (event: React.PointerEvent<HTMLElement>) => sideDrag.onPointerDown(place, event),
            onPointerMove: sideDrag.onPointerMove,
            onPointerUp: sideDrag.onPointerUp,
            onPointerCancel: sideDrag.onPointerCancel,
          },
        } : null;
        return (
          <section key={segment.key} className={classes} aria-labelledby={`${labelId}-${segment.key}`} aria-current={segment.active || undefined} {...dragged?.section}>
            <h4 id={`${labelId}-${segment.key}`} className="atlas-initiative-side__label" {...{ [TURN_KEY_ATTRIBUTE]: `side:${segment.key}` }} {...dragged?.label}>
              {segment.side?.roll == null ? label : (
                <>
                  <span className="atlas-initiative-side__name">{label}</span>
                  <span className="atlas-initiative-side__roll">{segment.side.roll}</span>
                </>
              )}
            </h4>
            {segment.items.map((entry) => card(entry, segment.key, segment.active))}
          </section>
        );
      })}
    </>
  );
};
