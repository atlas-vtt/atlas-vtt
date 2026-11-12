import { t } from '../../i18n';
import { MAX_MEASURES } from '../../measure/measureTypes';
import { showNotice } from '../../ui/notice';

/** Tells the GM that the level shown keeps as many measurements as it may, when another is to be kept. */
export function showMeasuresFullNotice(): void {
  showNotice(t('notice.measuresFull', { count: MAX_MEASURES }));
}
