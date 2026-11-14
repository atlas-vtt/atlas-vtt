/**
 * DefaultWidgetsTab — Toggle default widgets for new maps in a collection, and how its initiative tracker runs a fight.
 */

import React from 'react';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import type { NamedModifierStatblock } from '../../../initiative/modifierPreview';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import { InitiativeFields } from './InitiativeFields';
import { InfoMark } from './InfoMark';
import { SettingRow } from './SettingRow';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { t } from '../../../i18n';

interface DefaultWidgetsTabProps {
  defaultWidgets: Record<string, boolean>;
  onChange: (widgets: Record<string, boolean>) => void;
  initiative: InitiativeRules;
  onInitiativeChange: (initiative: InitiativeRules) => void;
  /** The statblock fields offered for the initiative modifier (`initiativeFieldSuggestions`). */
  initiativeFieldSuggestions: readonly FieldSuggestion[];
  /** The collection's statblocks, for what the modifier's field reads in them. */
  modifierStatblocks?: readonly NamedModifierStatblock[] | undefined;
  /** A line above the initiative rules, such as that a played campaign's rules apply in their place. */
  initiativeNotice?: React.ReactNode;
}

/** Available widget definitions for the MVP. */
const WIDGET_OPTIONS: { key: string; label: string; description: string }[] = [
  {
    key: 'initiativeTracker',
    label: t('csm.widgets.initiative'),
    description: t('csm.widgets.initiativeDesc'),
  },
  {
    key: 'timer',
    label: t('csm.widgets.timer'),
    description: t('csm.widgets.timerDesc'),
  },
];

export function DefaultWidgetsTab({
  defaultWidgets,
  onChange,
  initiative,
  onInitiativeChange,
  initiativeFieldSuggestions,
  modifierStatblocks,
  initiativeNotice,
}: DefaultWidgetsTabProps): React.ReactElement {
  const toggle = (key: string): void => {
    onChange({ ...defaultWidgets, [key]: !defaultWidgets[key] });
  };

  return (
    <>
      <section className="atlas-csm-section" aria-labelledby="atlas-csm-widgets-title">
        <span className="atlas-csm-label-row">
          <h4 id="atlas-csm-widgets-title" className="atlas-csm-section-title">{t('csm.widgets.title')}</h4>
          <InfoMark label={t('csm.widgets.newMapsInfo')} />
        </span>
        {WIDGET_OPTIONS.map((w) => (
          <SettingRow
            key={w.key}
            label={w.label}
            info={w.description}
            control={(labelId) => <ToggleSwitch labelledBy={labelId} value={!!defaultWidgets[w.key]} onChange={() => toggle(w.key)} />}
          />
        ))}
      </section>
      {initiativeNotice}
      <InitiativeFields initiative={initiative} onChange={onInitiativeChange} fieldSuggestions={initiativeFieldSuggestions} modifierStatblocks={modifierStatblocks} />
    </>
  );
}
