import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { isLootBaseLoaded, lootBaseItemCount, needsBases, type LootBase } from '../../../../loot/LootBaseReader';
import { baseName } from '../../../../utils/pathUtils';
import { t } from '../../../../i18n';

function baseSummary(base: LootBase | undefined): string {
  if (!base || !isLootBaseLoaded(base)) return t('csm.loot.reading');
  if (base.missing) return t('csm.loot.notFound');
  if (base.views.length === 0) return t('csm.loot.noViews');
  if (needsBases(base)) return t('csm.loot.basesOff');
  return `${t('csm.loot.views', { count: base.views.length })} · ${t('loot.items', { count: lootBaseItemCount(base) })}`;
}

interface BaseSourceRowProps {
  path: string;
  /** As read; undefined until it is. */
  base: LootBase | undefined;
  onRemove: () => void;
}

/** A loot base the collection rolls on as an Items table: each of its views is one. */
export function BaseSourceRow({ path, base, onRemove }: BaseSourceRowProps): React.ReactElement {
  const problem = base !== undefined && (base.missing || base.views.length === 0 || needsBases(base));
  return (
    <div className="atlas-rt-row">
      <div className="atlas-rt-row__head">
        <span className="atlas-rt-row__toggle atlas-rt-row__toggle--static">
          <span className="atlas-rt-row__name">{base?.name ?? baseName(path).replace(/\.base$/i, '')}</span>
          <span className={problem ? 'atlas-tables-chip atlas-tables-chip--problem' : 'atlas-tables-row__fact'}>
            {problem && <AlertTriangle />}
            {baseSummary(base)}
          </span>
        </span>
        <span className="atlas-rt-row__kind">{t('tables.kind.items')}</span>
        <LabelTooltip label={t('csm.loot.removeBase')}>
          <Button variant="ghost" size="icon" className="atlas-rt-row__remove" onClick={onRemove}>
            <Trash2 />
          </Button>
        </LabelTooltip>
      </div>
    </div>
  );
}
