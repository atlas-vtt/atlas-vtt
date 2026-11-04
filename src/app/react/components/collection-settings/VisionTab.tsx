/**
 * VisionTab — What new tokens of a collection start with (sight range, vision cone, senses),
 * and the senses its tokens can have. Vision itself stays off until switched on per token.
 */

import { t } from '../../../i18n';
import React, { useState } from 'react';
import { unitLabelFor } from '../../../grid/measurementFormat';
import { hasVisionDefaults } from '../../../gameSystems/visionDefaults';
import {
  VISION_FIELDS,
  visionDefaultsForm,
  visionDefaultsFromForm,
  visionFieldLabel,
  type VisionDefaultsForm,
} from '../../../lighting/tokenLighting';
import { NumberOverrideField } from '../../../pixi/token-renderer/NumberOverrideField';
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import type { TokenVisionDefaults } from '../../../types/lightingTypes';
import type { SenseDefinition } from '../../../types/senseTypes';
import { SensesEditor } from '../senses/SensesEditor';
import { SenseDefinitionList } from './SenseDefinitionList';

interface VisionTabProps {
  gridDefaults: CollectionGridDefaults;
  vision: TokenVisionDefaults | undefined;
  onChange: (vision: TokenVisionDefaults | undefined) => void;
  /** The senses of the collection: its own, else those of its game system. */
  senses: readonly SenseDefinition[];
  /** The whole list after the GM added, changed or deleted a sense of the collection's own. */
  onSensesChange: (senses: readonly SenseDefinition[]) => void;
}

export function VisionTab({ gridDefaults, vision, onChange, senses, onSensesChange }: VisionTabProps): React.ReactElement {
  const [form, setForm] = useState<VisionDefaultsForm>(() => visionDefaultsForm(vision, senses));
  // The default this form shows; it differs from `vision` only when the draft changed it from outside, e.g. loaded after mount.
  const [shown, setShown] = useState(vision);
  const unit = unitLabelFor(gridDefaults.unitType);

  if (vision !== shown) {
    setShown(vision);
    setForm(visionDefaultsForm(vision, senses));
  }

  const update = (next: VisionDefaultsForm): void => {
    const defaults = visionDefaultsFromForm(next);
    const edited = hasVisionDefaults(defaults) ? defaults : undefined;
    setForm(next);
    setShown(edited);
    onChange(edited);
  };

  // New tokens cannot start with a sense the collection no longer has.
  const dropDefault = (sense: SenseDefinition): void => {
    if (form.senses.some((row) => row.id === sense.id)) update({ ...form, senses: form.senses.filter((row) => row.id !== sense.id) });
  };

  return (
    <>
      <p className="atlas-csm-hint">
        {t('vision.defaultsIntro')}
      </p>
      {VISION_FIELDS.map((field) => (
        <NumberOverrideField
          key={field.key}
          label={visionFieldLabel(field, unit)}
          value={form[field.key]}
          onChange={(value) => update({ ...form, [field.key]: value })}
          placeholder={field.placeholder}
          resetLabel={field.resetLabel}
          {...(field.hint && { hint: field.hint })}
          {...(field.min !== undefined && { min: field.min })}
          {...(field.max !== undefined && { max: field.max })}
        />
      ))}
      <SensesEditor
        senses={form.senses}
        onChange={(rows) => update({ ...form, senses: rows ?? [] })}
        definitions={senses}
        unit={unit}
        emptyText={t('senses.emptyDefaults')}
      />
      <SenseDefinitionList senses={senses} unit={unit} onChange={onSensesChange} onDelete={dropDefault} />
    </>
  );
}
