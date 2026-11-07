import { t } from '../i18n';
import { showNotice } from '../ui/notice';

let shown = false;

/** Tells the user once per session that WebGL could not start, and what to turn on. */
export function showNoGraphicsNotice(): void {
  if (shown) return;
  shown = true;
  showNotice(t('view.noGraphics'), 15000);
}
