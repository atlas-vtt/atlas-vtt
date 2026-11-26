import { useCallback, useState } from 'react';
import type { App } from 'obsidian';
import { AssetRegistrationUncertainError } from '../../../../services/assetRegistrationRecovery';
import type { AssetService } from '../../../../services/AssetService';
import type { ProgressCount } from '../../primitives/useLingeringTask';
import { useFrameProgress } from '../../primitives/useFrameProgress';
import { saveTokenPreviews } from './saveTokenPreviews';
import type { SavedToken } from './tokenStatblocks';
import type { useTokenPreviews } from './useTokenPreviews';
import type { useStatblockRow } from './useStatblockRow';
import type { CreatorMode, EditTokenInput } from './types';
import { t } from '../../../../i18n';

interface CreatorSaveOptions {
  app: App | null;
  assetService: AssetService | null;
  mode: CreatorMode;
  collection: string;
  editToken: EditTokenInput | null;
  playerCharacters: boolean;
  previews: ReturnType<typeof useTokenPreviews>;
  statblockRow: ReturnType<typeof useStatblockRow>;
  signal: AbortSignal;
  /** Whether saving may start now (another pane open, a tag being made, no index yet). */
  allowed: boolean;
  onSaved: () => void;
}

export interface CreatorSave {
  isSubmitting: boolean;
  saveError: string;
  /** A registration that may have half happened: saving again could register the tokens twice. */
  saveBlocked: boolean;
  /** Saving's progress, at most once a frame; null while nothing is saving. */
  saving: ProgressCount | null;
  submit: () => Promise<void>;
  /** Forgets the state of an earlier save, as a creator opening again does. */
  clear: () => void;
}

/** Saving the creator's previews: one at a time, with progress, and what is left after a failure staying in place. */
export function useCreatorSave({ app, assetService, mode, collection, editToken, playerCharacters, previews, statblockRow, signal, allowed, onSaved }: CreatorSaveOptions): CreatorSave {
  const [saveError, setSaveError] = useState('');
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Saving reports every preview; the footer shows it at most once a frame
  const { progress, report, clear: clearProgress } = useFrameProgress();

  const submit = useCallback(async (): Promise<void> => {
    if (!allowed || isSubmitting || saveBlocked || !assetService || !app || previews.previews.length === 0) return;
    const total = previews.previews.length;
    setIsSubmitting(true);
    setSaveError('');
    const savedTokens: SavedToken[] = [];
    try {
      const saved = await saveTokenPreviews({
        app,
        assetService,
        mode,
        previews: previews.previews,
        collection,
        tags: [],
        onSaved: previews.removeMany,
        signal,
        editToken,
        playerCharacters,
        waitForOptimized: previews.waitForOptimized,
        onProgress: report,
        onTokensSaved: (tokens) => savedTokens.push(...tokens),
      });
      if (saved > 0) app.workspace.trigger('atlas-vtt:refresh-assets');
      if (saved === total) onSaved();
      else if (saved > 0) setSaveError(t('creator.savedSome', { saved, total }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('creator.savePreviewsFailed'));
      if (error instanceof AssetRegistrationUncertainError) setSaveBlocked(true);
    } finally {
      // Tokens registered before a failure get their statblocks too.
      statblockRow.createFor(savedTokens);
      setIsSubmitting(false);
      clearProgress();
    }
  }, [allowed, isSubmitting, saveBlocked, app, assetService, collection, editToken, mode, playerCharacters, onSaved, previews, signal, report, clearProgress, statblockRow]);

  const clear = useCallback((): void => {
    setIsSubmitting(false);
    clearProgress();
    setSaveError('');
    setSaveBlocked(false);
  }, [clearProgress]);

  const saving = isSubmitting ? progress ?? { done: 0, total: previews.previews.length } : null;
  return { isSubmitting, saveError, saveBlocked, saving, submit, clear };
}
