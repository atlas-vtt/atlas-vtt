import React from 'react';
import { Select, type SelectOption } from '../../packages/components/primitives/Select';
import { allBuiltInTemplates, builtInTemplate } from '../library/builtInTemplates';
import type { TemplateLibrarySnapshot } from '../library/TemplateLibrary';
import { isBuiltInTemplateId, type TemplateId } from '../model/templateTypes';
import { t } from '../../i18n';

/** Whether a role's template is there to start from: found, missing, or not known yet while the library reads the vault. */
export type TemplateState = 'found' | 'missing' | 'reading';

/** Where `id` stands in the library; a built-in is known at once, a vault template once the library has read the vault. */
export function templateState(id: TemplateId, library: TemplateLibrarySnapshot | null): TemplateState {
  if (isBuiltInTemplateId(id)) return builtInTemplate(id) ? 'found' : 'missing';
  if (library?.templates.some((entry) => !entry.builtIn && entry.template.id === id)) return 'found';
  return !library || library.loading ? 'reading' : 'missing';
}

/**
 * The templates a role can start from: the vault's first, then the built-ins marked as such,
 * those the collection's game system uses (`systemTemplateIds`) ahead of the others. A role
 * whose own template is not among them keeps it as the first choice, so the select shows it.
 */
export function templateOptions(
  value: TemplateId,
  library: TemplateLibrarySnapshot | null,
  systemTemplateIds: readonly TemplateId[],
): SelectOption<TemplateId>[] {
  const vault = (library?.templates ?? []).filter((entry) => !entry.builtIn)
    .map((entry): SelectOption<TemplateId> => ({ value: entry.template.id, label: entry.name }));
  const builtIns = allBuiltInTemplates();
  const ofSystem = new Set(systemTemplateIds);
  const ordered = [...builtIns.filter((builtIn) => ofSystem.has(builtIn.id)), ...builtIns.filter((builtIn) => !ofSystem.has(builtIn.id))]
    .map((builtIn): SelectOption<TemplateId> => ({ value: builtIn.id, label: builtIn.name, detail: t('statblockEditor.builtInDetail') }));
  const state = templateState(value, library);
  const own: SelectOption<TemplateId>[] = state === 'found' ? [] : [{ value, label: state === 'reading' ? t('statblockEditor.readingTemplates') : t('statblockEditor.missingTemplate') }];
  return [...own, ...vault, ...ordered];
}

interface TemplatePickerProps {
  value: TemplateId;
  library: TemplateLibrarySnapshot | null;
  /** The templates of the game system's roles, listed first among the built-ins. */
  systemTemplateIds: readonly TemplateId[];
  /** Id of the element that names the select. */
  labelledBy: string;
  onChange: (templateId: TemplateId) => void;
}

/** The template a role's new statblocks start from. */
export function TemplatePicker({ value, library, systemTemplateIds, labelledBy, onChange }: TemplatePickerProps): React.JSX.Element {
  return <Select value={value} options={templateOptions(value, library, systemTemplateIds)} labelledBy={labelledBy} onChange={onChange} />;
}
