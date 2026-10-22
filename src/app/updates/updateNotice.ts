import { setIcon } from 'obsidian';
import { ATLAS_GITHUB_URL } from '../support/communityLinks';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';
import atlasIconUrl from '../assets/brand/atlas-icon.webp';

/** Obsidian's page of Atlas, which reads the published manifest afresh and offers Update at once. */
const PLUGIN_PAGE_URL = 'obsidian://show-plugin?id=atlas-vtt';

export function releaseNotesUrl(version: string): string {
  return `${ATLAS_GITHUB_URL}/releases/tag/${encodeURIComponent(version)}`;
}

/** Hands the update to Obsidian: Atlas never installs anything itself. */
export function openUpdate(): void {
  window.open(PLUGIN_PAGE_URL);
}

/** Says that `version` is out, with Update and What's new; it stays until it is clicked. */
export function announceUpdate(version: string): void {
  const message = createFragment();
  const card = message.createDiv({ cls: 'atlas-vtt-plugin atlas-update-notice' });
  card.createEl('img', { cls: 'atlas-update-notice__icon', attr: { src: atlasIconUrl, alt: '' } });
  const body = card.createDiv({ cls: 'atlas-update-notice__body' });
  body.createDiv({ cls: 'atlas-update-notice__title', text: t('settings.updates.noticeTitle') });
  body.createDiv({ cls: 'atlas-update-notice__text', text: t('settings.updates.notice', { version }) });
  const actions = body.createDiv({ cls: 'atlas-update-notice__actions' });
  const update = actions.createEl('button', { cls: 'mod-cta', text: t('settings.updates.update') });
  const notes = actions.createEl('button', { text: t('settings.updates.whatsNew') });
  const close = card.createEl('button', { cls: 'btn btn--ghost btn--icon atlas-close-btn atlas-update-notice__close', attr: { 'aria-label': t('common.close') } });
  setIcon(close, 'x');
  const notice = showNotice(message, 0);
  close.addEventListener('click', () => notice.hide());
  update.addEventListener('click', () => {
    notice.hide();
    openUpdate();
  });
  notes.addEventListener('click', () => {
    notice.hide();
    window.open(releaseNotesUrl(version));
  });
}
