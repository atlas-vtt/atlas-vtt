/**
 * DefaultWidgetsTab — Toggle default widgets for new maps in a collection, and how its initiative tracker runs a fight.
 */

import React from 'react';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import type { NamedModifierStatblock } from '../../../initiative/modifierPreview';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import { InitiativeFields } from './InitiativeFields';
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
      <p className="atlas-csm-hint">
        These defaults apply to new maps of the collection.
      </p>
      {WIDGET_OPTIONS.map((w) => (
        <div key={w.key} className="atlas-csm-toggle-row">
          <div>
            <div className="atlas-csm-toggle-label">{w.label}</div>
            <div className="atlas-csm-hint">{w.description}</div>
          </div>
          <label className="atlas-csm-switch">
            <input
              type="checkbox"
              checked={!!defaultWidgets[w.key]}
              onChange={() => toggle(w.key)}
            />
            <span className="atlas-csm-switch-track" />
          </label>
        </div>
      ))}
      {initiativeNotice}
      <InitiativeFields initiative={initiative} onChange={onInitiativeChange} fieldSuggestions={initiativeFieldSuggestions} modifierStatblocks={modifierStatblocks} />
    </>
  );
}
