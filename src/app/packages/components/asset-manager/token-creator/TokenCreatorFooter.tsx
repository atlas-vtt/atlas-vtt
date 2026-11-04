import React from 'react';
import { Loader2, Save } from 'lucide-react';
import { Platform } from 'obsidian';
import { Button } from '../../primitives/button';
import { ProgressStatus } from '../../primitives/ProgressStatus';
import type { ProgressCount, ProgressTask } from '../../primitives/useLingeringTask';
import type { CreatorMode } from './types';
import { t } from '../../../../i18n';

interface TokenCreatorFooterProps {
  mode: CreatorMode;
  isEditing: boolean;
  count: number;
  saveError: string;
  /** Conversion of the images added last, while it runs. */
  optimization: ProgressCount | null;
  /** Saving, while it runs. */
  saving: ProgressCount | null;
  canSubmit: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

function savingLabel(mode: CreatorMode, isEditing: boolean): string {
  if (isEditing) return mode === 'map' ? t('creator.saving.updateMap') : t('creator.saving.updateToken');
  return mode === 'map' ? t('creator.saving.addMaps') : t('creator.saving.createTokens');
}

/** Status, progress and actions of the token creator. */
export function TokenCreatorFooter({ mode, isEditing, count, saveError, optimization, saving, canSubmit, onCancel, onSubmit }: TokenCreatorFooterProps): React.JSX.Element {
  const isSubmitting = saving !== null;
  const task: ProgressTask | null = saving
    ? { label: savingLabel(mode, isEditing), ...saving }
    : optimization ? { label: t('creator.optimizingImages'), ...optimization } : null;
    return (
    <footer className="atlas-token-creator__footer">
      <span className="atlas-token-creator__status">
        <ProgressStatus task={task} failed={Boolean(saveError)}>
          {saveError || (count === 0 ? t(`creator.${mode}.noneToCreate`) : t(`creator.${mode}.ready`, { count }))}
        </ProgressStatus>
      </span>
      <div className="atlas-token-creator__actions">
        <Button variant="outline" size="sm" onClick={() => { if (!isSubmitting) onCancel(); }}>{t('common.cancel')}</Button>
        <Button variant="default" size="sm" onClick={onSubmit} disabled={!canSubmit}>
          {isSubmitting ? <Loader2 className="atlas-spin" /> : <Save />}
          <span>{isSubmitting ? t(isEditing ? 'creator.updating' : 'creator.creating') : t(isEditing ? 'creator.update' : 'creator.create')}</span>
          {!isSubmitting && <kbd className="atlas-token-creator__kbd">{Platform.isMacOS ? '⌘' : 'Ctrl'}↵</kbd>}
        </Button>
      </div>
    </footer>
  );
}
