import { INVALID_NAME_CHARACTERS } from '../../../../services/assetPaths';
import { t } from '../../../../i18n';

/**
 * Why `name` cannot name a new folder, or null when it can. An empty name has no
 * message: the dialog only keeps Create disabled until something is typed.
 * `isTaken` says whether a file or folder of that name lies where the folder would go.
 */
export function folderNameProblem(name: string, isTaken: (trimmed: string) => boolean): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (INVALID_NAME_CHARACTERS.test(trimmed)) return t('names.invalidFolder');
  if (trimmed.startsWith('.')) return t('names.folderDot');
  if (isTaken(trimmed)) return t('am.folder.exists', { name: trimmed });
  return null;
}
