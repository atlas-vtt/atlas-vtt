import { annotationRoom, type AnnotationRecords } from '../../annotations/annotationList';
import { MAX_DRAWINGS, MAX_TEXTS } from '../../annotations/annotationTypes';
import { t } from '../../i18n';
import { showNotice } from '../../ui/notice';
import type { FullOf } from './DrawToolHost';

const NOTICES: Readonly<Record<FullOf, () => string>> = {
  drawings: () => t('notice.drawingsFull', { count: MAX_DRAWINGS }),
  texts: () => t('notice.textsFull', { count: MAX_TEXTS }),
  cuts: () => t('notice.drawingCutFull'),
  drawingsLeftOut: () => t('notice.drawingsLeftOut', { count: MAX_DRAWINGS }),
  textsLeftOut: () => t('notice.textsLeftOut', { count: MAX_TEXTS }),
};

/**
 * Tells the GM of a limit of drawings and texts: the level shown holds as many as it may when
 * another is to be added, a drawing can take no further cut, or a level was loaded with more than
 * are shown.
 */
export function showAnnotationsFullNotice(of: FullOf): void {
  showNotice(NOTICES[of]());
}

/**
 * Tells the GM when copies of drawings or texts cannot all land on the level whose objects these
 * are: the store adds as many as it has room for (`insertMapObjects`). Call it before the copies
 * are added.
 */
export function tellCopiesLeftOut(objects: AnnotationRecords, copies: { readonly drawings: readonly unknown[]; readonly texts: readonly unknown[] }, full: (of: FullOf) => void = showAnnotationsFullNotice): void {
  if (copies.drawings.length === 0 && copies.texts.length === 0) return;
  const room = annotationRoom(objects);
  if (copies.drawings.length > room.drawings) full('drawings');
  else if (copies.texts.length > room.texts) full('texts');
}
