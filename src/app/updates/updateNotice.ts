import { ATLAS_GITHUB_URL } from '../support/communityLinks';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';
import atlasIconUrl from '../assets/brand/atlas-icon.webp';
import { createAtlasButton } from '../ui/atlasButton';

/** Obsidian's page of Atlas, which reads the published manifest afresh and offers Update at once. */
const PLUGIN_PAGE_URL = 'obsidian://show-plugin?id=atlas-vtt';

export function releaseNotesUrl(version: string): string {
  return `${ATLAS_GITHUB_URL}/releases/tag/${encodeURIComponent(version)}`;
}

/** Hands the update to Obsidian: Atlas never installs anything itself. */
export function openUpdate(): void {
  window.open(PLUGIN_PAGE_URL);
}

/** Says that `version` is out, with Update and What's new; it stays until it is clicked, and `acted` hears that it was. */
export function announceUpdate(version: string, acted: () => void = () => undefined): void {
  const message = createFragment();
  const card = message.createDiv({ cls: 'atlas-vtt-plugin atlas-update-notice' });
  card.createEl('img', { cls: 'atlas-update-notice__icon', attr: { src: atlasIconUrl, alt: '' } });
  const body = card.createDiv({ cls: 'atlas-update-notice__body' });
  body.createDiv({ cls: 'atlas-update-notice__title', text: t('settings.updates.noticeTitle') });
  body.createDiv({ cls: 'atlas-update-notice__text', text: t('settings.updates.notice', { version }) });
  const actions = body.createDiv({ cls: 'atlas-update-notice__actions' });
  const update = createAtlasButton(actions, { text: t('settings.updates.update'), size: 'sm' });
  const notes = createAtlasButton(actions, { text: t('settings.updates.whatsNew'), variant: 'outline', size: 'sm' });
  const close = createAtlasButton(card, { variant: 'ghost', size: 'icon', icon: 'x', cls: ['atlas-close-btn', 'atlas-update-notice__close'], attr: { 'aria-label': t('common.close') } });
  const notice = showNotice(message, 0);
  close.addEventListener('click', () => {
    acted();
    notice.hide();
  });
  update.addEventListener('click', () => {
    acted();
    notice.hide();
    openUpdate();
  });
  notes.addEventListener('click', () => {
    acted();
    notice.hide();
    window.open(releaseNotesUrl(version));
  });
}
