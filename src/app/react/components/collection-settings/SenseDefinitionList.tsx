import React, { useId, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { t } from '../../../i18n';
import { isBuiltInSense, newSense, senseProblem, senseSummary } from '../../../gameSystems/senseEditing';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { SenseDefinition } from '../../../types/senseTypes';
import { SenseDefinitionEditor } from './SenseDefinitionEditor';

interface SenseDefinitionListProps {
  senses: readonly SenseDefinition[];
  /** Game unit of the collection, e.g. "ft". */
  unit: string;
  onChange: (senses: readonly SenseDefinition[]) => void;
  /** A sense of the collection's own was deleted. */
  onDelete: (sense: SenseDefinition) => void;
}

/**
 * The senses tokens of the collection can have. The ones Atlas ships are shown with what they
 * do; the collection's own open into their fields, for a homebrew system.
 */
export function SenseDefinitionList({ senses, unit, onChange, onDelete }: SenseDefinitionListProps): React.ReactElement {
  const headingId = useId();
  const [openId, setOpenId] = useState<string | null>(null);

  const add = (): void => {
    const sense = newSense(crypto.randomUUID());
    onChange([...senses, sense]);
    setOpenId(sense.id);
  };

  return (
    <section className="atlas-csm-senses">
      <h4 id={headingId} className="atlas-csm-senses__title">{t('senses.list.title')}</h4>
      <p className="atlas-csm-hint">{t('senses.list.hint')}</p>
      <ul className="atlas-csm-sense-list" role="list" aria-labelledby={headingId}>
        {senses.map((sense) => {
          if (isBuiltInSense(sense)) {
            return (
              <li key={sense.id} className="atlas-csm-sense">
                <span className="atlas-csm-sense__name">{sense.name}</span>
                <span className="atlas-csm-sense__text">{senseSummary(sense)}</span>
              </li>
            );
          }
          const name = sense.name.trim();
          const isOpen = sense.id === openId;
          // Its open fields say what is wrong; closed, the row says it, since Save stays off meanwhile.
          const problem = isOpen ? null : senseProblem(sense, senses);
          return (
            <li key={sense.id} className="atlas-csm-sense atlas-csm-sense--own">
              <span className="atlas-csm-sense__name">{name || t('senses.list.newSense')}</span>
              {problem
                ? <span className="atlas-csm-sense__text atlas-csm-sense__text--problem">{problem}</span>
                : <span className="atlas-csm-sense__text">{senseSummary(sense)}</span>}
              <span className="atlas-csm-sense__actions">
                <LabelTooltip label={name ? t('senses.list.edit', { name }) : t('senses.list.editNew')}>
                  <Button variant="ghost" size="icon" className="atlas-csm-sense__edit" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : sense.id)}>
                    <Pencil />
                  </Button>
                </LabelTooltip>
                <LabelTooltip label={name ? t('senses.list.delete', { name }) : t('senses.list.deleteNew')}>
                  <Button variant="ghost" size="icon" className="atlas-csm-condition-delete" onClick={() => { onChange(senses.filter((other) => other.id !== sense.id)); onDelete(sense); }}>
                    <Trash2 />
                  </Button>
                </LabelTooltip>
              </span>
              {isOpen && (
                <SenseDefinitionEditor
                  sense={sense}
                  all={senses}
                  unit={unit}
                  onChange={(next) => onChange(senses.map((other) => (other.id === sense.id ? next : other)))}
                />
              )}
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" className="atlas-csm-add-btn" onClick={add}>
        <Plus />
        {t('senses.list.addOwn')}
      </Button>
    </section>
  );
}
