import React, { useEffect, useRef } from 'react';
import { t } from '../../../../i18n';
import { DropdownSwatchGrid } from '../../../../packages/components/primitives/DropdownSwatchGrid';
import { RESOURCE_COLORS } from '../../../../resources/resourceColors';
import type { FieldSuggestion } from '../../../../resources/resourceFieldSuggestions';
import type { ResourceDefinition } from '../../../../resources/resourceTypes';
import { StatblockFieldChips } from '../StatblockFieldChips';
import type { SocketPlace } from './resourceSockets';

interface ResourceCardProps {
  place: SocketPlace;
  resource: ResourceDefinition;
  /** Statblock fields that hold a quantity: the role templates' (with their names), then the statblocks'. */
  fieldSuggestions: readonly FieldSuggestion[];
  /** The resource was just placed: its name is typed next. */
  focusName: boolean;
  onChange: (partial: Partial<ResourceDefinition>) => void;
}

/**
 * The name, statblock field and colour of the selected socket's resource. The fields of the
 * collection's role templates and statblocks are offered to click; typing in the field narrows them.
 */
export function ResourceCard({ place, resource, fieldSuggestions, focusName, onChange }: ResourceCardProps): React.ReactElement {
  const nameRef = useRef<HTMLInputElement>(null);
  // A socket that was just filled starts with its name
  useEffect(() => {
    if (focusName) nameRef.current?.focus();
  }, [focusName, place.slot]);

  return (
    <div className="atlas-csm-resource-card">
      <div className="atlas-csm-resource-card__head">
        <span className="atlas-csm-resource-card__dot" style={{ backgroundColor: resource.color }} />
        <span>{place.heading}</span>
      </div>
      <div className="atlas-csm-resource-card__fields">
        <label className="atlas-csm-resource-card__field">
          {t('resource.card.name')}
          <input ref={nameRef} type="text" className="atlas-csm-input" placeholder={t('resource.card.namePlaceholder')}
            aria-invalid={resource.name.trim() === '' ? true : undefined}
            value={resource.name} onChange={(event) => onChange({ name: event.target.value })} />
        </label>
        <label className="atlas-csm-resource-card__field">
          {t('resource.card.field')}
          <input type="text" className="atlas-csm-input" placeholder={t('resource.card.fieldPlaceholder')} spellCheck={false}
            aria-invalid={resource.field.trim() === '' ? true : undefined}
            value={resource.field} onChange={(event) => onChange({ field: event.target.value })} />
        </label>
      </div>
      <DropdownSwatchGrid label={t('common.colour')} swatches={RESOURCE_COLORS} value={resource.color} onChange={(color) => onChange({ color })} />
      <StatblockFieldChips suggestions={fieldSuggestions} value={resource.field} onPick={(field) => onChange({ field })} />
    </div>
  );
}
