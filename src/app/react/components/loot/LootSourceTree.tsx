import React from 'react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { LootBase } from '../../../loot/LootBaseReader';
import { t } from '../../../i18n';

interface CheckProps {
  on: boolean;
  label: string;
  count: number;
  onToggle: () => void;
}

/** A checkbox row; the label and count toggle it too. */
function CheckRow({ on, label, count, onToggle }: CheckProps): React.ReactElement {
  return (
    <label className={`atlas-loot-tree__check${on ? ' is-on' : ''}`}>
      <input type="checkbox" checked={on} onChange={onToggle} />
      <span className="atlas-loot-tree__label">{label}</span>
      <span className="atlas-loot-tree__count">{count}</span>
    </label>
  );
}

interface LootViewChecksProps {
  base: LootBase;
  /** Views switched off, of every base. */
  disabled: ReadonlySet<string>;
  onChange: (disabled: string[]) => void;
}

/** The views of a loot base as a checklist: only ticked views are rolled on. */
export function LootViewChecks({ base, disabled, onChange }: LootViewChecksProps): React.ReactElement | null {
  if (base.views.length < 2) return null;
  const ids = base.views.map((view) => view.id);
  const allOn = ids.every((id) => !disabled.has(id));

  const setViews = (changed: readonly string[], enabled: boolean): void => {
    const next = new Set(disabled);
    for (const id of changed) {
      if (enabled) next.delete(id);
      else next.add(id);
    }
    onChange([...next]);
  };

  return (
    <div className="atlas-loot-tree">
      <ul className="atlas-loot-tree__views">
        {base.views.map((view) => (
          <li key={view.id} className="atlas-loot-tree__row">
            <CheckRow
              on={!disabled.has(view.id)}
              label={view.name}
              count={view.items.length}
              onToggle={() => setViews([view.id], disabled.has(view.id))}
            />
          </li>
        ))}
      </ul>
      <LabelTooltip describe label={allOn ? t('loot.tree.untickAll') : t('loot.tree.tickAll')}>
        <button type="button" className="atlas-loot-text-button atlas-loot-tree__all" onClick={() => setViews(ids, !allOn)}>
          {allOn ? t('loot.tree.none') : t('loot.tree.all')}
        </button>
      </LabelTooltip>
    </div>
  );
}
