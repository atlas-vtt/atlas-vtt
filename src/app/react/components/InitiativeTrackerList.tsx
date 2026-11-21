import React, { useId } from 'react';
import type { ListSegment } from '../../initiative/listSegments';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { t } from '../../i18n';
import { TURN_KEY_ATTRIBUTE } from '../../initiative/motion/turnMotion';

interface InitiativeTrackerListProps {
  /** The list as it is drawn (`listSegments`). */
  segments: readonly ListSegment<InitiativeEntry>[];
  /** Draws a card; `inTurn` says it stands in the side whose turn it is. */
  card: (entry: InitiativeEntry, inTurn?: boolean) => React.ReactElement;
}

/**
 * The tracker's combatants: under their side in a fight by sides (with this round's roll where the
 * sides roll for their order), else in turn order, with
 * those that delayed their turn waiting below the order until they act. Where the list runs on
 * into the next round a divider names it. The cards of the order are siblings, so the turn and the
 * next ones can be scrolled into view together (`scrollWithin`).
 */
export const InitiativeTrackerList: React.FC<InitiativeTrackerListProps> = ({ segments, card }) => {
  const labelId = useId();

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
        if (label === null) return <React.Fragment key={segment.key}>{segment.items.map((entry) => card(entry))}</React.Fragment>;
        const classes = [
          'atlas-initiative-side',
          segment.active && 'atlas-initiative-side--active',
          segment.delayed && 'atlas-initiative-side--delayed',
        ].filter(Boolean).join(' ');
        return (
          <section key={segment.key} className={classes} aria-labelledby={`${labelId}-${segment.key}`} aria-current={segment.active || undefined}>
            <h4 id={`${labelId}-${segment.key}`} className="atlas-initiative-side__label" {...{ [TURN_KEY_ATTRIBUTE]: `side:${segment.key}` }}>
              {segment.side?.roll == null ? label : (
                <>
                  <span className="atlas-initiative-side__name">{label}</span>
                  <span className="atlas-initiative-side__roll">{segment.side.roll}</span>
                </>
              )}
            </h4>
            {segment.items.map((entry) => card(entry, segment.active))}
          </section>
        );
      })}
    </>
  );
};
