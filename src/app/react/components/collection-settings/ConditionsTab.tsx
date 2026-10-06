/**
 * ConditionsTab — CRUD list of user-defined token conditions with their badge colour and icon.
 */

import React, { useId, useState } from 'react';
import { Hash, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { CONDITION_EFFECTS, type ConditionDefinition, type ConditionEffect } from '../../../types/collectionSettingsTypes';
import { useExperimentalFeature } from '../../hooks/useExperimentalFeature';
import { conditionEffect, withConditionEffect } from '../../../gameSystems/conditionEffects';
import { conditionGlyph } from '../../../utils/conditionGlyph';
import { WidgetIconPicker } from '../WidgetIconPicker';
import { ConditionBadgePreview } from './ConditionBadgePreview';
import { t } from '../../../i18n';

interface ConditionsTabProps {
  conditions: ConditionDefinition[];
  onChange: (conditions: ConditionDefinition[]) => void;
}

type EffectChoice = ConditionEffect | 'none';

const EFFECT_LABELS: Record<ConditionEffect, string> = {
  blinded: t('csm.conditions.effect.blinded'),
  invisible: t('csm.conditions.effect.invisible'),
  airborne: t('csm.conditions.effect.airborne'),
  undetected: t('csm.conditions.effect.undetected'),
};

const EFFECT_OPTIONS: SelectOption<EffectChoice>[] = [
  { value: 'none', label: t('common.none') },
  ...CONDITION_EFFECTS.map((effect) => ({ value: effect, label: EFFECT_LABELS[effect] })),
];

/** Generate a random hex colour string. */
function randomColor(): string {
  const hex = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `#${hex}`;
}

export function ConditionsTab({
  conditions,
  onChange,
}: ConditionsTabProps): React.ReactElement {
  const [iconPickerId, setIconPickerId] = useState<string | null>(null);
  const effectLabel = useId();
  // A condition's effect on sight is part of dynamic lighting.
  const sightEffects = useExperimentalFeature('dynamicLighting');

  const updateCondition = (
    index: number,
    partial: Partial<ConditionDefinition>,
  ): void => {
    const updated = conditions.map((c, i) =>
      i === index ? { ...c, ...partial } : c,
    );
    onChange(updated);
  };

  const clearIcon = (index: number): void => {
    onChange(conditions.map((c, i) => {
      if (i !== index) return c;
      const { icon: _icon, ...rest } = c;
      return rest;
    }));
  };

  const addCondition = (): void => {
    const newCondition: ConditionDefinition = {
      id: crypto.randomUUID(),
      name: '',
      color: randomColor(),
    };
    onChange([...conditions, newCondition]);
  };

  const toggleValued = (index: number): void => {
    onChange(conditions.map((c, i) => {
      if (i !== index) return c;
      if (!c.valued) return { ...c, valued: true };
      const { valued: _valued, ...rest } = c;
      return rest;
    }));
  };

  const removeCondition = (index: number): void => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <>
      <p className="atlas-csm-hint">
        {t('csm.conditions.intro')}
      </p>
      {sightEffects && (
        <p className="atlas-csm-hint">{t('csm.conditions.effectsHint')}</p>
      )}

      {conditions.length > 0 ? (
        <div className="atlas-csm-condition-list">
          {sightEffects && (
            <div className="atlas-csm-condition-head" aria-hidden="true">
              <span>{t('csm.conditions.column')}</span>
              <span>{t('csm.conditions.effect')}</span>
            </div>
          )}
          {conditions.map((cond, i) => (
            <div key={cond.id} className="atlas-csm-condition">
              <div className="atlas-csm-condition-row">
                <LabelTooltip label={t('csm.conditions.chooseIcon')}>
                  <button
                    type="button"
                    className="atlas-csm-condition-badge-button"
                    aria-expanded={iconPickerId === cond.id}
                    onClick={() => setIconPickerId(iconPickerId === cond.id ? null : cond.id)}
                  >
                    <ConditionBadgePreview condition={cond} size={24} />
                  </button>
                </LabelTooltip>
                <input
                  type="text"
                  className="atlas-csm-input"
                  placeholder={t('csm.conditions.name')}
                  value={cond.name}
                  onChange={(e) => updateCondition(i, { name: e.target.value })}
                />
                {sightEffects && (
                  <div className={`atlas-csm-condition-effect${conditionEffect(cond) ? '' : ' atlas-csm-condition-effect--none'}`}>
                    <span id={`${effectLabel}-${cond.id}`} hidden>{cond.name.trim() ? t('csm.conditions.effectOf', { name: cond.name.trim() }) : t('csm.conditions.effectOfThis')}</span>
                    <Select
                      value={conditionEffect(cond) ?? 'none'}
                      options={EFFECT_OPTIONS}
                      labelledBy={`${effectLabel}-${cond.id}`}
                      onChange={(effect) => onChange(conditions.map((c, index) => (index === i ? withConditionEffect(c, effect) : c)))}
                    />
                  </div>
                )}
                <div
                  className="atlas-csm-color-swatch"
                  style={{ backgroundColor: cond.color }}
                >
                  <LabelTooltip label={t('csm.conditions.pickColour')}>
                    <input
                      type="color"
                      value={cond.color}
                      onChange={(e) => updateCondition(i, { color: e.target.value })}
                    />
                  </LabelTooltip>
                </div>
                <LabelTooltip label={cond.valued ? t('csm.conditions.valued') : t('csm.conditions.makeValued')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-csm-condition-valued"
                    aria-pressed={!!cond.valued}
                    onClick={() => toggleValued(i)}
                  >
                    <Hash />
                  </Button>
                </LabelTooltip>
                <LabelTooltip label={t('csm.conditions.remove')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-csm-condition-delete"
                    onClick={() => removeCondition(i)}
                  >
                    <Trash2 />
                  </Button>
                </LabelTooltip>
              </div>
              {iconPickerId === cond.id && (
                <WidgetIconPicker
                  label={t('csm.conditions.icon')}
                  value={cond.icon}
                  color={cond.color}
                  onChange={(icon) => updateCondition(i, { icon })}
                  noIcon={{
                    label: t('csm.conditions.initial'),
                    content: <span className="atlas-csm-condition-initial">{glyphInitial(cond)}</span>,
                    onSelect: () => clearIcon(i),
                  }}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="atlas-csm-empty">{t('csm.conditions.empty')}</div>
      )}

      <Button variant="ghost" className="atlas-csm-add-btn" onClick={addCondition}>
        <Plus />
        {t('csm.conditions.add')}
      </Button>
    </>
  );
}

/** The letter a condition's badge shows while it has no icon. */
function glyphInitial(condition: ConditionDefinition): string {
  const glyph = conditionGlyph({ name: condition.name });
  return glyph.kind === 'text' ? glyph.text : '';
}
