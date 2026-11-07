import React, { useState } from 'react';
import type { HiddenSummary, OptionsFacet, RangeFacet } from '../../../../../creatures/creatureFilterEngine';
import { hasPicks, LAYOUT_FACET, withOptionState, withRange, withStatblockFilter } from '../../../../../creatures/creatureSelection';
import type { StatblockLinkFilter } from '../../../../../types/creatureFilterTypes';
import { Button } from '../../../primitives/button';
import { SegmentedControl } from '../../../primitives/SegmentedControl';
import { Skeleton, SkeletonGroup } from '../../../primitives/Skeleton';
import type { CreatureFilterPanel } from '../../hooks/useCreatureFilters';
import { FilterSection } from './FilterSection';
import { OptionFilter } from './OptionFilter';
import { RangeFilter } from './RangeFilter';
import { t } from '../../../../../i18n';

const STATBLOCK_CHOICES = [
  { value: 'any', label: t('filters.all') },
  { value: 'linked', label: t('filters.withStatblock') },
  { value: 'unlinked', label: t('filters.without') },
] as const;

/** The statblock template's filters show this many before the rest fold away. */
const TEMPLATE_FOLD_AT = 3;

function isFacetActive(facet: RangeFacet | OptionsFacet): boolean {
  return 'values' in facet ? facet.selected !== null : facet.options.some((option) => option.state !== null);
}

/** Why tokens are hidden only for lacking what a filter reads; null while none is. */
export function hiddenFilterText({ withoutStatblock, withoutField }: HiddenSummary): string | null {
  const parts = [
    ...(withoutStatblock > 0 ? [t('filters.hiddenNoStatblock', { count: withoutStatblock })] : []),
    ...withoutField.map(({ label, count }) => t('filters.hiddenNoField', { count, field: label.toLocaleLowerCase() })),
  ];
  return parts.length > 0 ? t('filters.hidden', { parts: parts.join(', ') }) : null;
}

/** The two placeholder filters: the widths of their title and of their chips, in px. */
const SKELETON_FILTERS = [
  { title: 96, chips: [64, 88, 52, 76, 60] },
  { title: 56, chips: [72, 48, 84] },
] as const;

/** Stands in for the filters while the statblocks they come from are read. */
function FilterSkeleton(): React.JSX.Element {
  return (
    <SkeletonGroup label="Reading statblocks…" className="atlas-filter-skeleton">
      {SKELETON_FILTERS.map((filter) => (
        <div key={filter.title} className="atlas-filter-section">
          <div className="atlas-filter-section__header"><Skeleton shape="text" width={filter.title} /></div>
          <div className="atlas-filter-chips">
            {filter.chips.map((width) => <Skeleton key={width} shape="pill" className="atlas-filter-chip-skeleton" width={width} />)}
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}

interface CreatureFilterControlsProps {
  panel: CreatureFilterPanel;
  /** Offers the With / Without statblock choice; off where every token listed has one. */
  statblockFilter?: boolean;
}

/**
 * Every filter the characters in view offer: the statblock choice, the shared statblock fields as
 * ranges and option chips, the template facet, then the fields of the collection's statblock
 * templates. The filter panel under the search shows them; the encounter builder's sidebar keeps
 * them open.
 */
export function CreatureFilterControls({ panel, statblockFilter = true }: CreatureFilterControlsProps): React.JSX.Element {
  const { selection, setSelection, result } = panel;
  const { facets } = result;
  const ranges = facets.ranges.filter((facet) => facet.values.length > 1 || facet.selected);
  const options = facets.options.filter((facet) => facet.options.length > 0);
  const showLayouts = facets.layouts.length > 1 || hasPicks(selection.layouts);
  const fromTemplate = (facet: RangeFacet | OptionsFacet): boolean => facet.definition.origin === 'template';
  const templateFacets = [...ranges.filter(fromTemplate), ...options.filter(fromTemplate)];
  const hasStatblockFields = ranges.length > 0 || options.length > 0 || showLayouts;
  const [templateExpanded, setTemplateExpanded] = useState(false);
  // Folded to its first few while it holds many; never while one of the folded ones filters.
  const foldsTemplate = templateFacets.length > TEMPLATE_FOLD_AT
    && !templateFacets.slice(TEMPLATE_FOLD_AT).some((facet) => isFacetActive(facet));
  const shownTemplateFacets = foldsTemplate && !templateExpanded ? templateFacets.slice(0, TEMPLATE_FOLD_AT) : templateFacets;

  const renderFacet = (facet: RangeFacet | OptionsFacet): React.JSX.Element => ('values' in facet ? (
    <RangeFilter
      key={facet.definition.id}
      facet={facet}
      onChange={(range) => setSelection((current) => withRange(current, facet.definition.id, range))}
    />
  ) : (
    <OptionFilter
      key={facet.definition.id}
      title={facet.definition.label}
      options={facet.options}
      onChange={(key, state) => setSelection((current) => withOptionState(current, facet.definition.id, key, state))}
    />
  ));

  return (
    <>
      <p className="atlas-filter-panel__hint">{t('filters.hint')}</p>
      {statblockFilter && (
        <FilterSection title={t('filters.statblock')} active={selection.statblock !== 'any'}>
          <SegmentedControl
            className="atlas-filter-panel__statblock"
            ariaLabel={t('filters.statblock')}
            value={selection.statblock}
            options={STATBLOCK_CHOICES}
            onChange={(value: StatblockLinkFilter) => setSelection((current) => withStatblockFilter(current, value))}
          />
        </FilterSection>
      )}

      {ranges.filter((facet) => !fromTemplate(facet)).map(renderFacet)}
      {options.filter((facet) => !fromTemplate(facet)).map(renderFacet)}

      {showLayouts && (
        <OptionFilter
          title={t('filters.template')}
          options={facets.layouts}
          onChange={(layout, state) => setSelection((current) => withOptionState(current, LAYOUT_FACET, layout, state))}
        />
      )}

      {templateFacets.length > 0 && (
        <div className="atlas-filter-panel__group" role="group" aria-label={t('filters.templateFields')}>
          <div className="atlas-filter-panel__group-label">{t('filters.templateFields')}</div>
          {shownTemplateFacets.map(renderFacet)}
          {foldsTemplate && (
            <Button variant="ghost" className="atlas-filter-chips__more" onClick={() => setTemplateExpanded(!templateExpanded)}>
              {templateExpanded ? t('filters.showFewer') : t('filters.showAll', { count: templateFacets.length })}
            </Button>
          )}
        </div>
      )}

      {!hasStatblockFields && (panel.pending ? <FilterSkeleton /> : (
        <p className="atlas-filter-panel__empty">
          {t('filters.linkHint')}
        </p>
      ))}
    </>
  );
}
