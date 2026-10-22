import React from 'react';
import { VISION_FIELDS, visionFieldLabel, type LightForm, type VisionForm } from '../../lighting/tokenLighting';
import { SensesEditor } from '../../react/components/senses/SensesEditor';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { InheritedSenses } from '../../creatures/creatureSenses';
import type { SenseDefinition } from '../../types/senseTypes';
import { numberText } from '../../utils/numberInput';
import { LightEmissionFields } from '../lighting/LightEmissionFields';
import { EditTokenSection, SwitchRow } from './EditTokenSections';
import { NumberOverrideField } from './NumberOverrideField';
import { t } from '../../i18n';

/** What the map and its collection say about vision and light, for the token being edited. */
export interface TokenLightingContext {
  /** Game unit of the map, e.g. "ft". */
  unit: string;
  /** Game units one grid cell spans. */
  unitDistance: number;
  /** The farthest a light may reach on this map (`maxLightRange`). */
  maxLightRange: number;
  /** The senses of the map's collection. */
  senses: readonly SenseDefinition[];
  /** The lights of the map's collection. */
  lightPresets: readonly LightPresetDefinition[];
  /**
   * What the token's linked statblock says about senses (`useStatblockSenses`): the token follows
   * these senses while it has none of its own, and is blind beyond them where the statblock says so.
   */
  inherited?: InheritedSenses | null;
}

/**
 * What the empty sight range field says: how far the token sees without a range of its own. A
 * creature its statblock calls blind beyond its senses sees that far, or not at all.
 */
function sightRangePlaceholder(inherited: InheritedSenses | null | undefined, fallback: string): string {
  if (!inherited?.blindBeyond) return fallback;
  return `${inherited.blindBeyondRange === undefined ? 'None' : numberText(inherited.blindBeyondRange)}, from statblock`;
}

interface TokenVisionSectionProps {
  vision: VisionForm;
  onChange: (vision: VisionForm) => void;
  context: TokenLightingContext;
}

/** The Edit Token dialog's section for how the token sees: its sight range and angle side by side, then its senses. */
export function TokenVisionSection({ vision, onChange, context }: TokenVisionSectionProps): React.ReactElement {
  const { unit, inherited } = context;
  return (
    <EditTokenSection title={t('vision.toggle')}>
      <SwitchRow
        label="Vision (party member)"
        hint="The players see the map through this token. The token itself is always visible to them."
        value={vision.enabled}
        onChange={(enabled) => onChange({ ...vision, enabled })}
      />
      {vision.enabled && (
        <>
          <div className="atlas-edit-token__fields">
            {VISION_FIELDS.map((field) => (
              <NumberOverrideField
                key={field.key}
                label={visionFieldLabel(field, unit)}
                value={vision[field.key]}
                onChange={(value) => onChange({ ...vision, [field.key]: value })}
                placeholder={field.key === 'range' ? sightRangePlaceholder(inherited, field.placeholder) : field.placeholder}
                resetLabel={field.resetLabel}
                {...(field.hint && { hint: field.hint })}
                {...(field.min !== undefined && { min: field.min })}
                {...(field.max !== undefined && { max: field.max })}
              />
            ))}
          </div>
          <SensesEditor
            senses={vision.senses}
            onChange={(next) => onChange({ ...vision, senses: next })}
            definitions={context.senses}
            unit={unit}
            emptyText={t('senses.emptyToken')}
            {...(inherited && { inheritedSenses: inherited.senses, notRecognised: inherited.notRecognised })}
          />
        </>
      )}
    </EditTokenSection>
  );
}

interface TokenLightSectionProps {
  light: LightForm;
  onChange: (light: LightForm) => void;
  context: TokenLightingContext;
}

/** The Edit Token dialog's section for the light the token carries, with the light popover's fields while it carries one. */
export function TokenLightSection({ light, onChange, context }: TokenLightSectionProps): React.ReactElement {
  return (
    <EditTokenSection title={t('vision.carriedLight')}>
      <SwitchRow
        label="Carries a light"
        hint="A torch or a lantern: its light moves with the token."
        value={light.on}
        onChange={(on) => onChange({ ...light, on })}
      />
      {light.on && (
        <div className="atlas-edit-token__light">
          <LightEmissionFields
            emission={light.emission}
            onChange={(emission) => onChange({ ...light, emission })}
            presets={context.lightPresets}
            unit={context.unit}
            unitDistance={context.unitDistance}
            maxRange={context.maxLightRange}
          />
        </div>
      )}
    </EditTokenSection>
  );
}
