import React from 'react';
import { Lock } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { ActionsMenuButton } from '../../../../packages/components/shared/ActionsMenuButton';
import type { SessionSnapshot } from '../sessionTypes';
import { capsuleMenuEntries, type CapsuleMenuInput } from './capsuleMenu';
import { t } from '../../../../i18n';

export interface TemplateCapsuleProps {
  snapshot: SessionSnapshot;
  /** Opens the save dialog. */
  onSave: () => void;
  menu: CapsuleMenuInput;
}

/** Save has something to do: changes not saved yet, or a template never saved; never while one save runs. */
export function canSave(snapshot: SessionSnapshot): boolean {
  return !snapshot.readOnly && snapshot.dirty && snapshot.saveState !== 'saving';
}

/** Save covers the card; the note on the left is a note of its own. */
export const SAVE_HINT = t('templateEditor.saveHint');
/** A template without a file has no note yet: Save writes the text on the left into it. */
export const DRAFT_SAVE_HINT = t('templateEditor.draftSaveHint');

/**
 * The template editor's header capsule (§2.3): the template's name, Save and
 * ⋯. One line as tall as the note view's, so the card starts at the same
 * height; the name truncates. Save is shown disabled, never `disabled`: a
 * disabled button shows no tooltip, and its tooltip says why typing in the
 * note leaves it so (a template without a file saves its text with it).
 */
export function TemplateCapsule({ snapshot, onSave, menu }: TemplateCapsuleProps): React.JSX.Element {
  return (
    <div className="atlas-sb-pane-header atlas-te-capsule" role="toolbar" aria-label={t('templateEditor.template')} data-te-region="header">
      <span className="atlas-te-capsule__name">
        {snapshot.readOnly && <Lock aria-hidden="true" className="atlas-sb-pane-template__lock" />}
        <span className="atlas-te-name">{snapshot.name}</span>
      </span>
      <span className="atlas-sb-pane-header__end atlas-te-capsule__end">
        <LabelTooltip label={snapshot.path === null ? DRAFT_SAVE_HINT : SAVE_HINT} describe multiline>
          <Button
            type="button"
            variant="default"
            className="atlas-te-capsule__save"
            aria-disabled={canSave(snapshot) ? undefined : true}
            onClick={canSave(snapshot) ? onSave : undefined}
          >
            {t('templateEditor.save.save')}
          </Button>
        </LabelTooltip>
        <ActionsMenuButton label={t('templateEditor.moreActions')} entries={capsuleMenuEntries(menu)} className="atlas-sb-pane-header__more" />
      </span>
    </div>
  );
}
