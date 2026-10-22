import React, { useId } from 'react';
import { Trash2 } from 'lucide-react';
import { t } from '../../../i18n';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { withActionName, withActionText, withForOthers } from '../../../recovery/editor/recoveryChoiceEdits';
import { MAX_ACTION_TEXT } from '../../../recovery/parseRecovery';
import type { RecoveryAction } from '../../../recovery/recoveryTypes';
import { CommitTextInput } from './CommitTextInput';
import { MAX_NAME_LENGTH } from './RailNameInput';

interface ActionFieldsProps {
  action: RecoveryAction;
  /** The step keeps at least one action: its last cannot be removed. */
  removable: boolean;
  onChange: (action: RecoveryAction) => void;
  onRemove: () => void;
  /** Registers the name field, which takes focus once the action is added. */
  nameRef: (element: HTMLElement | null) => void;
}

/** The selected action of a step: its name, its sentence for the player, whether it may be taken for another, and Remove. */
export function ActionFields({ action, removable, onChange, onRemove, nameRef }: ActionFieldsProps): React.ReactElement {
  const othersId = useId();
  return (
    <div className="atlas-rc-action">
      <div className="atlas-rc-action__row">
        <CommitTextInput ref={nameRef} className="atlas-rc-action__name" value={action.name} required maxLength={MAX_NAME_LENGTH}
          label={t('recoveryEditor.action.name')} onCommit={(name) => onChange(withActionName(action, name))} />
        <div className="atlas-rc-switch">
          <span id={othersId} className="atlas-csm-toggle-label">{t('recoveryEditor.action.forOthers')}</span>
          <ToggleSwitch size="s" value={action.forOthers === true} labelledBy={othersId}
            onChange={() => onChange(withForOthers(action, action.forOthers !== true))} />
        </div>
        {/* Named Remove either way; while it cannot remove, its tooltip says why */}
        <LabelTooltip label={removable ? t('recoveryEditor.action.remove') : t('recoveryEditor.action.lastOne')} describe={!removable}>
          <button type="button" className="atlas-rc-scopes__remove" aria-label={t('recoveryEditor.action.remove')}
            aria-disabled={!removable || undefined} onClick={() => { if (removable) onRemove(); }}>
            <Trash2 aria-hidden="true" />
          </button>
        </LabelTooltip>
      </div>
      <CommitTextInput value={action.text ?? ''} maxLength={MAX_ACTION_TEXT} label={t('recoveryEditor.action.text')}
        placeholder={t('recoveryEditor.action.textPlaceholder')} onCommit={(text) => onChange(withActionText(action, text))} />
    </div>
  );
}
