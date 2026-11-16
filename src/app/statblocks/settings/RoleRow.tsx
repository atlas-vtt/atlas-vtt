import React, { useId } from 'react';
import type { App } from 'obsidian';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import type { TemplateLibrarySnapshot } from '../library/TemplateLibrary';
import type { StatblockRole } from '../model/roleTypes';
import type { TemplateId } from '../model/templateTypes';
import { FolderField } from './FolderField';
import { TemplatePicker } from './TemplatePicker';
import { t } from '../../i18n';

interface RoleRowProps {
  app: App;
  role: StatblockRole;
  /** Why the role cannot be saved (`roleNameProblem`); null when it can. */
  problem: string | null;
  /** The role's folder as stored or typed; empty for Obsidian's location for new notes. */
  folder: string;
  library: TemplateLibrarySnapshot | null;
  systemTemplateIds: readonly TemplateId[];
  /** The name of the built-in new statblocks start from while the role's own template is missing; null while it is there. */
  fallbackName: string | null;
  /** Gives the name field the focus when the row appears (a role just added). */
  autoFocus: boolean;
  /** False for the collection's only role: there is always one to make a statblock with. */
  removable: boolean;
  onChange: (role: StatblockRole) => void;
  onFolderChange: (folder: string) => void;
  onRemove: () => void;
  /** Opens the role's template; the row has no Edit without it. */
  onEdit?: (() => void) | undefined;
  /** Why Edit cannot run now (the settings cannot be saved); null while it can. */
  editBlocked: string | null;
}

/** One role of the collection: its name, the template and folder of its new statblocks. */
export function RoleRow({
  app, role, problem, folder, library, systemTemplateIds, fallbackName, autoFocus, removable,
  onChange, onFolderChange, onRemove, onEdit, editBlocked,
}: RoleRowProps): React.JSX.Element {
  const templateLabel = useId();
  const name = role.name.trim() || 'this role';

  return (
    <div className="atlas-csm-condition atlas-sb-role">
      <div className="atlas-csm-condition-row">
        <input
          type="text"
          className="atlas-csm-input atlas-sb-role__name"
          placeholder={t('statblockEditor.role.name')}
          aria-label={t('statblockEditor.role.name')}
          aria-invalid={problem ? true : undefined}
          autoFocus={autoFocus}
          value={role.name}
          onChange={(event) => onChange({ ...role, name: event.target.value })}
        />
        <div className="atlas-sb-role__template">
          <span id={templateLabel} hidden>{t('statblockEditor.role.templateOf', { name })}</span>
          <TemplatePicker
            value={role.templateId}
            library={library}
            systemTemplateIds={systemTemplateIds}
            labelledBy={templateLabel}
            onChange={(templateId) => onChange({ ...role, templateId })}
          />
        </div>
        {onEdit && (
          <LabelTooltip label={editBlocked ?? t('statblockEditor.role.editHint')} describe>
            <Button
              variant="ghost"
              size="sm"
              className="atlas-sb-role__edit"
              aria-disabled={editBlocked ? true : undefined}
              // Not `disabled`: a disabled button shows no tooltip, and this one says why.
              onClick={editBlocked ? undefined : onEdit}
            >
              Edit
            </Button>
          </LabelTooltip>
        )}
        <LabelTooltip label={removable ? t('statblockEditor.role.remove') : t('statblockEditor.role.lastOne')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-csm-condition-delete atlas-sb-role__remove"
            aria-disabled={removable ? undefined : true}
            onClick={removable ? onRemove : undefined}
          >
            <Trash2 />
          </Button>
        </LabelTooltip>
      </div>
      <div className="atlas-csm-condition-row">
        <FolderField app={app} value={folder} onChange={onFolderChange} label={t('statblockEditor.role.folder', { name })} />
        {fallbackName !== null && (
          <LabelTooltip label={t('statblockEditor.role.missingTemplate', { name: fallbackName })} describe multiline>
            {/* Focusable, so the explanation also opens from the keyboard. */}
            <span className="atlas-sb-role__missing" role="note" tabIndex={0}>
              <AlertTriangle aria-hidden="true" />
              {t('statblockEditor.role.using', { name: fallbackName })}
            </span>
          </LabelTooltip>
        )}
      </div>
      {problem && <p className="atlas-csm-hint atlas-csm-hint--error">{problem}</p>}
    </div>
  );
}
