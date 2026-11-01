import type { App, TFile } from 'obsidian';
import { formatList, t } from '../i18n';
import type { AssetService } from '../services/AssetService';
import { showNotice } from '../ui/notice';
import { importSoundFiles, recordVaultSounds } from './soundImport';

/** A refusal stays long enough to read the names. */
const PROBLEM_NOTICE_MS = 12_000;

/** Adds files from outside the vault to a collection, with a notice while it runs and one for what came of it. */
export async function runSoundImport(app: App, assetService: AssetService, files: readonly File[], collectionId: string): Promise<void> {
  const progress = showNotice(t('audio.importing', { done: 0, total: files.length }), 0);
  const outcome = await importSoundFiles({ app, assetService }, files, collectionId, (done, total) => {
    progress.setMessage(t('audio.importing', { done, total }));
  });
  progress.hide();
  if (outcome.added.length > 0) showNotice(t('audio.added', { count: outcome.added.length }));
  if (outcome.refused.length > 0) showNotice(t('audio.notAudio', { files: formatList(outcome.refused) }), PROBLEM_NOTICE_MS);
  if (outcome.failed.length > 0) showNotice(t('audio.couldNotAdd', { files: formatList(outcome.failed) }), PROBLEM_NOTICE_MS);
  if (outcome.added.length > 0) app.workspace.trigger('atlas-vtt:refresh-assets');
}

/** Records files of the vault as sounds of a collection, where they lie. */
export async function runVaultSoundImport(app: App, assetService: AssetService, files: readonly TFile[], collectionId: string): Promise<void> {
  const added = await recordVaultSounds({ app, assetService }, files, collectionId);
  if (added.length === 0) return;
  showNotice(t('audio.added', { count: added.length }));
  app.workspace.trigger('atlas-vtt:refresh-assets');
}
