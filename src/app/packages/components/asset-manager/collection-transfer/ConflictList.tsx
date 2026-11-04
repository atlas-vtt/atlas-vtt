import React, { useId } from 'react';
import type { ConflictReason, Resolution } from '../../../../services/collectionBundle/importPlan';
import type { ReviewUnit } from '../../../../services/collectionBundle/importReview';
import { Button } from '../../primitives/button';
import { SegmentedControl, type SegmentedOption } from '../../primitives/SegmentedControl';
import { t } from '../../../../i18n';

const REASONS: Record<ConflictReason, string> = {
  'both-changed': t('conflict.bothChanged'),
  'deleted-by-you': t('conflict.deletedByYou'),
  'removed-by-update': t('conflict.removedByUpdate'),
  'unknown-origin': t('conflict.unknownOrigin'),
};

const RESOLUTIONS: readonly SegmentedOption<Resolution>[] = [
  { value: 'mine', label: t('conflict.keepMine') },
  { value: 'theirs', label: t('conflict.useUpdate') },
];

interface ConflictListProps {
  conflicts: readonly ReviewUnit[];
  resolutions: ReadonlyMap<string, Resolution>;
  onChange: (resolutions: Map<string, Resolution>) => void;
}

/** Items the user and the update both changed, each with its own choice; unresolved ones keep the user's version. */
export function ConflictList({ conflicts, resolutions, onChange }: ConflictListProps): React.JSX.Element {
  const setAll = (resolution: Resolution): void => onChange(new Map(conflicts.map((unit) => [unit.key, resolution])));
  const titleId = useId();
  return (
    <section className="atlas-transfer-conflicts" aria-labelledby={titleId}>
      <div className="atlas-transfer-conflicts__header">
        <strong id={titleId}>Your changes and the update overlap ({conflicts.length})</strong>
        <div className="atlas-transfer-conflicts__bulk">
          <Button variant="ghost" size="sm" onClick={() => setAll('mine')}>{t('conflict.keepMineAll')}</Button>
          <Button variant="ghost" size="sm" onClick={() => setAll('theirs')}>{t('conflict.useUpdateAll')}</Button>
        </div>
      </div>
      <ul className="atlas-transfer-conflicts__list">
        {conflicts.map((unit) => (
          <li key={unit.key} className="atlas-transfer-conflict">
            <div className="atlas-transfer-conflict__label">
              <span className="atlas-transfer-conflict__name">{unit.kind} &ldquo;{unit.name}&rdquo;</span>
              <span className="atlas-transfer-conflict__reason">{REASONS[unit.reason]}</span>
            </div>
            <SegmentedControl
              ariaLabel={`${unit.kind} ${unit.name}`}
              className="atlas-transfer-conflict__choice"
              value={resolutions.get(unit.key) ?? 'mine'}
              options={RESOLUTIONS}
              onChange={(resolution) => onChange(new Map(resolutions).set(unit.key, resolution))}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
