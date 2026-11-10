/**
 * CreatureFiltersTab: which statblock fields the asset manager filters this
 * collection's characters by. Atlas' own filters can be switched off; filters
 * on other fields are added from those the collection's statblocks have.
 */

import React, { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { CATALOG_CREATURE_FILTERS } from '../../../creatures/creatureFieldCatalog';
import type { DiscoveredField } from '../../../creatures/creatureFieldDiscovery';
import { filterFields, filterForField, newCreatureFilterId } from '../../../creatures/creatureFilterDefinitions';
import type { IndexedCreature } from '../../../creatures/CreatureIndex';
import { suggestedFilterFields } from '../../../creatures/templateFilterFields';
import { templateCreatureFilters } from '../../../creatures/templateCreatureFilters';
import type { StatblockTemplate } from '../../../statblocks/model/templateTypes';
import type { CreatureFilterDefinition } from '../../../types/creatureFilterTypes';
import { CatalogFilterList } from './CatalogFilterList';
import { CreatureFieldSuggestions } from './CreatureFieldSuggestions';
import { CreatureFilterRow } from './CreatureFilterRow';
import { t } from '../../../i18n';

interface CreatureFiltersTabProps {
  /** Ids of Atlas' own filters switched off. */
  hidden: string[];
  onHiddenChange: (hidden: string[]) => void;
  /** The collection's filters on fields of its own. */
  custom: CreatureFilterDefinition[];
  onCustomChange: (filters: CreatureFilterDefinition[]) => void;
  /** The statblocks linked to the collection's characters. */
  creatures: readonly IndexedCreature[];
  /** Whether those statblocks are still being read. */
  pending: boolean;
  /** The templates of the collection's statblock roles, whose fields are suggested first. */
  templates?: readonly StatblockTemplate[];
}

const NO_TEMPLATES: readonly StatblockTemplate[] = [];

export function CreatureFiltersTab({ hidden, onHiddenChange, custom, onCustomChange, creatures, pending, templates = NO_TEMPLATES }: CreatureFiltersTabProps): React.ReactElement {
  const discovered = useMemo(() => suggestedFilterFields(templates, creatures), [templates, creatures]);
  // The templates' fields filter by themselves, so only those the collection does not filter yet are suggested.
  const fromTemplates = useMemo(() => templateCreatureFilters(templates, [...CATALOG_CREATURE_FILTERS, ...custom]), [templates, custom]);
  const unused = useMemo(() => {
    const used = new Set([...CATALOG_CREATURE_FILTERS, ...custom, ...fromTemplates].flatMap(filterFields));
    return discovered.filter((field) => !used.has(field.field));
  }, [discovered, custom, fromTemplates]);
  // Custom ids never take one of Atlas' own.
  const taken = useMemo(() => [...CATALOG_CREATURE_FILTERS, ...custom], [custom]);

  const update = (index: number, filter: CreatureFilterDefinition): void => {
    onCustomChange(custom.map((current, i) => (i === index ? filter : current)));
  };

  const move = (index: number, offset: -1 | 1): void => {
    const target = index + offset;
    if (target < 0 || target >= custom.length) return;
    const next = [...custom];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onCustomChange(next);
  };

  const addBlank = (): void => {
    onCustomChange([...custom, { id: newCreatureFilterId(taken, 'filter'), label: '', kind: 'range', field: '' }]);
  };

  const addDiscovered = (field: DiscoveredField): void => {
    onCustomChange([...custom, filterForField(taken, field.field, field.kind, field.label)]);
  };

  return (
    <>
      <p className="atlas-csm-hint">
        {t('csm.filters.intro')}
      </p>

      <div className="atlas-csm-field">
        <div className="atlas-csm-label">{t('csm.filters.atlasFilters')}</div>
        <CatalogFilterList hidden={hidden} onHiddenChange={onHiddenChange} creatures={creatures} pending={pending} />
      </div>

      {fromTemplates.length > 0 && (
        <div className="atlas-csm-field">
          <div className="atlas-csm-label">{t('csm.filters.templateFilters')}</div>
          <p className="atlas-csm-hint">{t('csm.filters.templateFiltersHint')}</p>
          <CatalogFilterList
            hidden={hidden}
            onHiddenChange={onHiddenChange}
            creatures={creatures}
            pending={pending}
            filters={fromTemplates}
            label={t('csm.filters.templateFilters')}
          />
        </div>
      )}

      <div className="atlas-csm-field">
        <div className="atlas-csm-label">{t('csm.filters.yours')}</div>
        <p className="atlas-csm-hint">
          {t('csm.filters.yoursHint')}
        </p>
        {custom.length > 0 && (
          <div className="atlas-csm-condition-list">
            {custom.map((filter, i) => (
              <CreatureFilterRow
                key={filter.id}
                filter={filter}
                isFirst={i === 0}
                isLast={i === custom.length - 1}
                onChange={(next) => update(i, next)}
                onMove={(offset) => move(i, offset)}
                onRemove={() => onCustomChange(custom.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
        <Button variant="ghost" className="atlas-csm-add-btn" onClick={addBlank}>
          <Plus />
          {t('csm.filters.add')}
        </Button>
      </div>

      <div className="atlas-csm-field">
        <div className="atlas-csm-label">Other fields in this collection&apos;s statblocks</div>
        <CreatureFieldSuggestions fields={unused} statblockCount={creatures.length} pending={pending} onAdd={addDiscovered} />
      </div>
    </>
  );
}
