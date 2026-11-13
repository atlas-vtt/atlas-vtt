import { MAX_DRAWINGS, MAX_TEXTS } from '../../annotations/annotationTypes';
import { t } from '../../i18n';
import { showNotice } from '../../ui/notice';
import type { FullOf } from './DrawToolHost';

/** Tells the GM that the level shown holds as many drawings or texts as it may, when another is to be added. */
export function showAnnotationsFullNotice(of: FullOf): void {
  showNotice(of === 'texts' ? t('notice.textsFull', { count: MAX_TEXTS }) : t('notice.drawingsFull', { count: MAX_DRAWINGS }));
}
