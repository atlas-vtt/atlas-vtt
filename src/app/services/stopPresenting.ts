import { Notice } from 'obsidian';
import { presentedScene } from './PresentedScene';
import { t } from '../i18n';

/** Stop presenting: an open player window keeps the last scene it showed. */
export function stopPresenting(): void {
  if (!presentedScene.current()) return;
  presentedScene.clear();
  new Notice(t('present.stopped'));
}
