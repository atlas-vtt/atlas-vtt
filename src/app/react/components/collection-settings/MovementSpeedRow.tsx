/**
 * MovementSpeedRow — How far a creature moves that states no speed: a token moves by its own
 * speed, else by its statblock's, else by this one. A collection that measures in range bands
 * picks it as a band; it is kept in game units either way.
 */

import React from 'react';
import { collectionUnitName, unitLabelFor } from '../../../grid/measurementFormat';
import { withUnit } from '../../../lighting/tokenLighting';
import { isMovementSpeed, MAX_MOVEMENT_SPEED, withMovementSpeed, type MovementRules } from '../../../measure/movementRules';
import { stepsByBands } from '../../../measure/reachSteps';
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import { BandReachSelect, type BandReachSettings } from '../measure/BandReachSelect';
import { SettingRow } from './SettingRow';
import { t } from '../../../i18n';

interface MovementSpeedRowProps {
  /** The rules as typed: a speed may be no speed yet while it is. */
  movement: MovementRules;
  onChange: (movement: MovementRules) => void;
  /** What the collection measures in: its unit, and its bands where it names distances. */
  gridDefaults: CollectionGridDefaults;
}

/** The collection's bands as a reach is picked from them; null where it has none to pick from. */
function bandsOf(gridDefaults: CollectionGridDefaults): BandReachSettings | null {
  const settings = { mode: gridDefaults.measurementMode, rangeBands: gridDefaults.abstractRangeBands ?? [], unitDistance: gridDefaults.unitDistance };
  return settings.unitDistance > 0 && stepsByBands(settings) ? settings : null;
}

export function MovementSpeedRow({ movement, onChange, gridDefaults }: MovementSpeedRowProps): React.ReactElement {
  const bands = bandsOf(gridDefaults);
  const setSpeed = (speed: number | undefined): void => onChange(withMovementSpeed(movement, speed));
  const isValid = movement.speed === undefined || isMovementSpeed(movement.speed);
  const label = t('csm.movement.speed');

  return (
    <SettingRow
      label={bands ? label : withUnit(label, unitLabelFor(gridDefaults.unitType, collectionUnitName(gridDefaults)))}
      info={t('csm.movement.speedInfo')}
      control={(labelId) => (bands ? (
        <BandReachSelect value={movement.speed} onChange={setSpeed} settings={bands} noneLabel={t('common.none')} labelledBy={labelId} />
      ) : (
        <input
          type="number"
          className="atlas-csm-input atlas-csm-input--number"
          aria-labelledby={labelId}
          aria-invalid={!isValid || undefined}
          min={0}
          max={MAX_MOVEMENT_SPEED}
          placeholder={t('common.none')}
          value={movement.speed ?? ''}
          onChange={(e) => {
            // An emptied field is no speed; anything else is kept as typed, and Save waits until it is one.
            const raw = e.target.value.trim();
            setSpeed(raw === '' ? undefined : Number(raw));
          }}
        />
      ))}
    >
      {!isValid && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('csm.movement.speedInvalid')}</p>}
    </SettingRow>
  );
}
