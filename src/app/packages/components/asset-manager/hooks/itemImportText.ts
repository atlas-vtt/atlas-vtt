import type { ItemImportResult } from '../../../../services/itemBundle/itemImport';
import { t } from '../../../../i18n';

/** The title of an item install's result. */
export function itemImportTitle(result: ItemImportResult): string {
  return result.outcome === 'update' ? t('itemReview.done.updatedTitle') : t('itemReview.done.addedTitle');
}

/** What an item install did, in a sentence. */
export function describeItemImport(result: ItemImportResult): string {
  const values = { name: result.name, version: result.version };
  switch (result.outcome) {
    case 'new': return t('itemReview.done.added', values);
    case 'update': return t('itemReview.done.updated', values);
    case 'copy': return t('itemReview.done.copied', values);
    case 'reuse':
    case 'keep': return t('itemReview.done.same', values);
  }
}
