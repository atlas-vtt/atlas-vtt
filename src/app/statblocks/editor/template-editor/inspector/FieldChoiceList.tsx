import React, { useEffect, useRef } from 'react';
import { useKeepInView } from '../../../../packages/components/primitives/useKeepInView';
import { cn } from '../../../../../utils/cn';
import { FIELD_TYPE_LABELS } from '../editorGlyphs';
import type { FieldChoice, FieldChoiceGroup } from './fieldChoices';
import { t } from '../../../../i18n';

export interface FieldChoiceListProps {
  id: string;
  /** Names the list; the control that opened it. */
  label: string;
  groups: readonly FieldChoiceGroup[];
  /** The highlighted choice: Enter takes it. */
  active: FieldChoice | undefined;
  onHover: (choice: FieldChoice) => void;
  onPick: (choice: FieldChoice) => void;
}

/** The id of a choice's row, for `aria-activedescendant`. */
export function choiceId(listId: string, choice: FieldChoice): string {
  return `${listId}-${choice.kind}-${choice.key}`;
}

function hint(choice: FieldChoice): string {
  switch (choice.kind) {
    case 'field': return FIELD_TYPE_LABELS[choice.type];
    case 'collection': return choice.count === 1 ? '1 statblock' : `${choice.count} statblocks`;
    case 'new': return choice.key;
  }
}

/**
 * The field picker's open list (§7.4), context-menu rows under group labels:
 * this template's fields, the collection's keys, then New field “Speed”. Focus
 * stays in the control that opened it, which moves the highlight.
 */
export function FieldChoiceList({ id, label, groups, active, onHover, onPick }: FieldChoiceListProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const keepInView = useKeepInView(ref, true, 'bottom');
  const activeId = active ? choiceId(id, active) : null;

  useEffect(() => {
    if (activeId) ref.current?.ownerDocument.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  return (
    <div
      ref={ref}
      id={id}
      role="listbox"
      aria-label={label}
      className={cn('atlas-te-choices', keepInView.capped && 'atlas-keep-in-view--capped')}
      style={keepInView.style}
    >
      {groups.length === 0 && <div className="atlas-te-choices__empty">{t('templateEditor.noFieldMatches')}</div>}
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.label ?? t('templateEditor.newProperty')} className="atlas-te-choices__group">
          {group.label && <div className="atlas-te-choices__group-label" aria-hidden="true">{group.label}</div>}
          {group.choices.map((choice) => (
            <div
              key={`${choice.kind}:${choice.key}`}
              id={choiceId(id, choice)}
              role="option"
              aria-selected={choice === active}
              data-highlighted={choice === active ? '' : undefined}
              className="atlas-ctx-item atlas-te-choices__item"
              onPointerMove={() => onHover(choice)}
              // The control keeps focus, so its keys go on working after a click.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onPick(choice)}
            >
              <span className="atlas-te-choices__label">
                {choice.kind === 'new' ? t('templateEditor.newPropertyNamed', { name: choice.label }) : choice.label}
              </span>
              <span className={cn('atlas-te-choices__hint', choice.kind === 'new' && 'atlas-te-choices__hint--key')}>
                {hint(choice)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
