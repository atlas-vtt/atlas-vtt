import { formatList, t } from '../i18n';
import type { SoundKind } from '../sound/soundTypes';
import { showNotice } from '../ui/notice';
import { importIntoLibrary } from './libraryOperations';
import type { SoundLibrary } from './SoundLibrary';

const PROBLEM_NOTICE_MS = 12_000;

/** Copies files from outside to the top of a root, with a notice while it runs and one for what came of it. */
export async function runLibraryImport(library: SoundLibrary, files: readonly File[], kind: SoundKind): Promise<void> {
  const progress = showNotice(t('audio.importing', { done: 0, total: files.length }), 0);
  const outcome = await importIntoLibrary(library, files, kind, (done, total) => {
    progress.setMessage(t('audio.importing', { done, total }));
  });
  progress.hide();
  if (outcome.added.length > 0) showNotice(t('audio.added', { count: outcome.added.length }));
  if (outcome.refused.length > 0) showNotice(t('audio.notAudio', { files: formatList(outcome.refused) }), PROBLEM_NOTICE_MS);
  if (outcome.failed.length > 0) showNotice(t('audio.couldNotAdd', { files: formatList(outcome.failed) }), PROBLEM_NOTICE_MS);
}
