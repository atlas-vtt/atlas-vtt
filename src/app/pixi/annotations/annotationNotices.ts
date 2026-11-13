import { MAX_DRAWINGS, MAX_TEXTS } from '../../annotations/annotationTypes';
import { t } from '../../i18n';
import { showNotice } from '../../ui/notice';
import { promptForText } from '../../ui/textInputDialog';
import type { FullOf } from './DrawToolHost';

/** Tells the GM that the level shown holds as many drawings or texts as it may, when another is to be added. */
export function showAnnotationsFullNotice(of: FullOf): void {
  showNotice(of === 'texts' ? t('notice.textsFull', { count: MAX_TEXTS }) : t('notice.drawingsFull', { count: MAX_DRAWINGS }));
}

/** Asks the GM for the words of a text to put on the map; null where none are given. */
export function askForText(): Promise<string | null> {
  return promptForText({ title: t('text.add'), confirmLabel: t('creator.create'), placeholder: t('text.placeholder') });
}

/** Asks the GM for the words of a text that is on the map, starting from `words`; null where they are left as they are. */
export function askForTextEdit(words: string): Promise<string | null> {
  return promptForText({ title: t('text.editTitle'), confirmLabel: t('common.save'), initialValue: words });
}
