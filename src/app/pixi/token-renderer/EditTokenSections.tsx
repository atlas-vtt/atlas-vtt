import React, { useId } from 'react';
import { ToggleSwitch } from '../../packages/components/primitives/Toggle';
import type { ResourceDefinition, ResourceValue } from '../../resources/resourceTypes';
import { NumberOverrideField } from './NumberOverrideField';
import { t } from '../../i18n';

interface EditTokenSectionProps {
  title: string;
  children: React.ReactNode;
}

/** A section of the Edit Token dialog: its heading, and its fields below it at one spacing. */
export function EditTokenSection({ title, children }: EditTokenSectionProps): React.ReactElement {
  const headingId = useId();
  return (
    <section className="atlas-edit-token__section" aria-labelledby={headingId}>
      <h4 id={headingId} className="atlas-edit-token__section-label">{title}</h4>
      {children}
    </section>
  );
}

interface SwitchRowProps {
  label: string;
  /** A line under the label that says what the switch does. */
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** A switch at the end of the row that names it. */
export function SwitchRow({ label, hint, value, onChange }: SwitchRowProps): React.ReactElement {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="atlas-edit-token__switch-row">
      <div className="atlas-edit-token__field">
        <span id={labelId} className="atlas-edit-token__label">{label}</span>
        {hint && <span id={hintId} className="atlas-edit-token__hint">{hint}</span>}
      </div>
      <ToggleSwitch labelledBy={labelId} {...(hint && { 'aria-describedby': hintId })} value={value} onChange={() => onChange(!value)} />
    </div>
  );
}

interface TokenIdentitySectionProps {
  name: string;
  onNameChange: (name: string) => void;
  showNameplate: boolean;
  onShowNameplateChange: (show: boolean) => void;
  /** The name field, which takes the focus when the dialog opens. */
  nameRef: React.Ref<HTMLInputElement>;
}

export function TokenIdentitySection({ name, onNameChange, showNameplate, onShowNameplateChange, nameRef }: TokenIdentitySectionProps): React.ReactElement {
  const nameId = useId();
  return (
    <EditTokenSection title={t('editToken.token')}>
      <div className="atlas-edit-token__field">
        <label className="atlas-edit-token__label" htmlFor={nameId}>{t('editToken.name')}</label>
        <input
          id={nameId}
          ref={nameRef}
          type="text"
          className="atlas-input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('editToken.namePlaceholder')}
        />
      </div>
      <SwitchRow label={t('editToken.showNameplate')} value={showNameplate} onChange={onShowNameplateChange} />
    </EditTokenSection>
  );
}

/** What an empty field says: the maximum the linked statblock gives the resource, if any. */
function defaultPlaceholder(max: number | undefined): string {
  return max === undefined ? t('editToken.none') : t('editToken.statblockDefault', { value: max });
}

interface TokenResourcesSectionProps {
  /** The resources of the map's collection, in the order they show. */
  definitions: readonly ResourceDefinition[];
  /** What each field holds, as typed, by resource key. */
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** What the linked statblock gives each resource. */
  defaults: Record<string, ResourceValue>;
}

/** The maximum of each resource, two to a row; a static resource's field is its value. */
export function TokenResourcesSection({ definitions, values, onChange, defaults }: TokenResourcesSectionProps): React.ReactElement {
  return (
    <EditTokenSection title={t('editToken.resources')}>
      <div className="atlas-edit-token__fields">
        {definitions.map(({ key, name, direction }) => (
          <NumberOverrideField
            key={key}
            label={direction === 'static' ? name : t('resource.maxShort', { name })}
            value={values[key] ?? ''}
            onChange={(value) => onChange(key, value)}
            placeholder={defaultPlaceholder(defaults[key]?.max)}
            resetLabel={t('editToken.resetStatblock')}
          />
        ))}
      </div>
    </EditTokenSection>
  );
}
