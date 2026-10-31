/**
 * StatblocksTab: the kinds of statblock a collection makes (its roles), each with the template
 * a new statblock of it starts from and the folder it is created in. Offered while the
 * statblock editor is switched on (Experimental features).
 */

import React, { useState } from 'react';
import type { App } from 'obsidian';
import { Plus, RotateCcw } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { builtInTemplate } from '../library/builtInTemplates';
import { useTemplateLibrary } from '../library/useTemplateLibrary';
import type { StatblockRole, StatblockRoleFolders } from '../model/roleTypes';
import type { TemplateId } from '../model/templateTypes';
import {
  collectionStatblockRoles, editedStatblockRoles, GENERIC_ROLE_TEMPLATE_ID, roleFolder, roleTemplate,
} from '../roles/collectionStatblockRoles';
import { draftRoleId, roleNameProblem, statblockRolesAreValid } from '../roles/roleValidation';
import { LayoutAdoptionList } from '../editor/fs-import/LayoutAdoptionList';
import { RoleRow } from './RoleRow';
import { TemplateList } from './TemplateList';
import { templateState } from './TemplatePicker';
import { t } from '../../i18n';
import './statblocks-tab.scss';

export interface StatblocksTabProps {
  app: App;
  /** The collection the dialog edits: the tab lists the Fantasy Statblocks layouts of its statblocks. */
  collectionId?: string | undefined;
  /** The collection's own roles; undefined while it takes its game system's. */
  ownRoles: readonly StatblockRole[] | undefined;
  onOwnRolesChange: (roles: readonly StatblockRole[] | undefined) => void;
  /** The collection's folder per role id, whether the roles are its own or its system's. */
  folders: StatblockRoleFolders;
  onFoldersChange: (folders: StatblockRoleFolders) => void;
  systemPresetId: string | undefined;
  presets: readonly SystemPreset[];
  /** Whether the dialog's settings can be saved, which Edit does first. */
  canSave: boolean;
  /** Saves the settings, closes the dialog and opens the template; without it rows have no Edit. */
  onEditTemplate?: ((templateId: TemplateId) => void) | undefined;
}

/** `folders` with the role's folder set, or removed when it is cleared. */
export function withRoleFolder(folders: StatblockRoleFolders, roleId: string, folder: string): StatblockRoleFolders {
  const rest = Object.fromEntries(Object.entries(folders).filter(([id]) => id !== roleId));
  return folder ? { ...rest, [roleId]: folder } : rest;
}

/** What the muted label above inherited roles says; null for roles of the collection's own. */
function inheritedLabel(own: boolean, preset: SystemPreset | undefined): string | null {
  if (own) return null;
  return preset?.rules.statblockRoles?.length ? t('statblockEditor.role.fromSystem', { name: preset.name }) : t('statblockEditor.role.defaults');
}

export function StatblocksTab({
  app, collectionId, ownRoles, onOwnRolesChange, folders, onFoldersChange, systemPresetId, presets, canSave, onEditTemplate,
}: StatblocksTabProps): React.ReactElement {
  const library = useTemplateLibrary(app);
  /** The role just added, whose name field takes the focus. */
  const [added, setAdded] = useState<string | null>(null);
  const preset = presets.find((candidate) => candidate.id === systemPresetId);
  const systemRoles = preset?.rules.statblockRoles;
  const systemTemplateIds = systemRoles?.map((role) => role.templateId) ?? [];
  const roles = collectionStatblockRoles({ statblockRoles: ownRoles, systemPresetId }, presets);
  const own = ownRoles !== undefined;
  const label = inheritedLabel(own, preset);
  const fallbackName = builtInTemplate(GENERIC_ROLE_TEMPLATE_ID)?.name ?? 'generic';
  const editBlocked = canSave ? null
    : statblockRolesAreValid(roles) ? 'Fix the errors on the other tabs first' : 'Every role needs a name of its own first';

  // An edit that ends at the system's roles stores none, so the collection keeps following its system.
  const edit = (next: readonly StatblockRole[]): void => onOwnRolesChange(editedStatblockRoles(next, systemRoles));

  const add = (): void => {
    const role: StatblockRole = { id: draftRoleId(), name: '', templateId: GENERIC_ROLE_TEMPLATE_ID };
    setAdded(role.id);
    edit([...roles, role]);
  };

  const exists = (id: TemplateId): boolean => templateState(id, library) !== 'missing';

  return (
    <>
      <p className="atlas-csm-hint">
        {t('statblockEditor.role.hint')}
      </p>

      <div className="atlas-csm-field">
        <div className="atlas-sb-roles__head">
          <span className="atlas-csm-label">{t('statblockEditor.role.roles')}</span>
          {label && <span className="atlas-sb-roles__source">{label}</span>}
          {own && (
            <Button variant="ghost" className="atlas-csm-add-btn atlas-sb-roles__revert" onClick={() => onOwnRolesChange(undefined)}>
              <RotateCcw />
              {systemRoles?.length ? t('statblockEditor.role.useSystem') : t('statblockEditor.role.useDefault')}
            </Button>
          )}
        </div>
        <div className="atlas-csm-condition-list">
          {roles.map((role, index) => {
            const template = roleTemplate(role, exists);
            return (
              <RoleRow
                key={role.id}
                app={app}
                role={role}
                problem={roleNameProblem(roles, index)}
                folder={roleFolder({ statblockRoleFolders: folders }, role.id) ?? ''}
                library={library}
                systemTemplateIds={systemTemplateIds}
                fallbackName={template.missing ? fallbackName : null}
                autoFocus={role.id === added}
                removable={roles.length > 1}
                onChange={(next) => edit(roles.map((current, i) => (i === index ? next : current)))}
                onFolderChange={(folder) => onFoldersChange(withRoleFolder(folders, role.id, folder))}
                onRemove={() => edit(roles.filter((_, i) => i !== index))}
                onEdit={onEditTemplate && (() => onEditTemplate(template.templateId))}
                editBlocked={editBlocked}
              />
            );
          })}
        </div>
        <Button variant="ghost" className="atlas-csm-add-btn" onClick={add}>
          <Plus />
          {t('statblockEditor.role.add')}
        </Button>
      </div>

      <TemplateList
        app={app}
        roles={roles}
        systemTemplateIds={systemTemplateIds}
        library={library}
        onEditTemplate={onEditTemplate}
        editBlocked={editBlocked}
        onUseForRole={(roleId, templateId) => edit(roles.map((role) => (role.id === roleId ? { ...role, templateId } : role)))}
        // Inherited roles followed their system, which the deletion already moved.
        onReplaceTemplate={(from, to) => { if (own) edit(roles.map((role) => (role.templateId === from ? { ...role, templateId: to } : role))); }}
      />

      {collectionId && <LayoutAdoptionList app={app} collectionId={collectionId} />}
    </>
  );
}
