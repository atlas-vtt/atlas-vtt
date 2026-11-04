import type { App } from 'obsidian';
import { runInBackground } from '../../../utils/backgroundTask';
import { showNotice } from '../../../ui/notice';
import { t } from '../../../i18n';

/** Opens a vault file in a new tab; `name` says which in the notice when it is gone. */
export function openNote(app: App, path: string, name: string): void {
  const file = app.vault.getFileByPath(path);
  if (!file) {
    showNotice(t('loot.noteGone', { name }));
    return;
  }
  runInBackground(app.workspace.getLeaf('tab').openFile(file), `Opening ${file.path}`, t('loot.openFailed'));
}

/** Opens a wikilink of a result in a new tab. */
export function openLink(app: App, link: string): void {
  runInBackground(app.workspace.openLinkText(link, '', true), `Opening ${link}`, t('loot.openFailed'));
}
