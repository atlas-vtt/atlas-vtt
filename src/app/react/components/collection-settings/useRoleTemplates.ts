import { useMemo } from 'react';
import type { App } from 'obsidian';
import { builtInTemplate } from '../../../statblocks/library/builtInTemplates';
import { useTemplateLibrary } from '../../../statblocks/library/useTemplateLibrary';
import type { StatblockRole } from '../../../statblocks/model/roleTypes';
import { isBuiltInTemplateId, type StatblockTemplate, type TemplateId } from '../../../statblocks/model/templateTypes';

/** The templates the roles start from, each once in role order; a template that is missing is left out. */
export function roleTemplatesOf(roles: readonly Pick<StatblockRole, 'templateId'>[], lookup: (id: TemplateId) => StatblockTemplate | null): StatblockTemplate[] {
  const templates = new Map<TemplateId, StatblockTemplate>();
  for (const { templateId } of roles) {
    const template = templates.has(templateId) ? null : lookup(templateId);
    if (template) templates.set(templateId, template);
  }
  return [...templates.values()];
}

/**
 * The templates of `ids`, each once in order, read while `active`; a template that is missing is
 * left out. Built-ins are read directly; the template library is followed only while an id names
 * a template of the vault, so it is not loaded where every id is a built-in.
 */
export function useTemplates(app: App | null, ids: readonly TemplateId[], active: boolean): readonly StatblockTemplate[] {
  const needsVault = active && ids.some((id) => !isBuiltInTemplateId(id));
  const snapshot = useTemplateLibrary(needsVault ? app : null);
  return useMemo(() => {
    if (!active) return [];
    const inVault = (id: TemplateId): StatblockTemplate | undefined => snapshot?.templates.find((entry) => entry.template.id === id)?.template;
    return roleTemplatesOf(ids.map((templateId) => ({ templateId })), (id) => (isBuiltInTemplateId(id) ? builtInTemplate(id)?.template : inVault(id)) ?? null);
  }, [active, ids, snapshot]);
}

/** The templates of a collection's statblock roles, read while `active` (`useTemplates`). */
export function useRoleTemplates(app: App | null, roles: readonly StatblockRole[], active: boolean): readonly StatblockTemplate[] {
  const ids = useMemo(() => roles.map((role) => role.templateId), [roles]);
  return useTemplates(app, ids, active);
}
