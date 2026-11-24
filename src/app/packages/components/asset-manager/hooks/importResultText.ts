import type { CollectionImportResult } from '../../../../services/collectionBundle/collectionImport';
import type { ItemImportResult } from '../../../../services/itemBundle/itemImport';
import type { MusicImportResult } from '../../../../services/musicBundle/musicImport';
import { formatList, t } from '../../../../i18n';

/** What a collection import did, in a sentence or two. */
export function describeImport(result: CollectionImportResult): string {
  const name = t('bundle.nameVersion', { name: result.collectionName, version: result.version });
  const switched = result.switchedNotes > 0 ? ` ${t('bundle.switchedNotes', { count: result.switchedNotes })}` : '';
  if (result.created) return `${t('bundle.imported', { name })}${switched}`;
  const parts = [t('bundle.filesWritten', { count: result.written }), t('bundle.filesRemoved', { count: result.removed })];
  if (result.keptLocal > 0) parts.push(t('bundle.keptLocal', { count: result.keptLocal }));
  const backup = result.backupCount > 0 ? t('bundle.backedUp', { folder: result.backupFolder }) : '';
  return `${t('bundle.updated', { name, parts: parts.join(', '), backup })}${switched}`;
}

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

/** The title of a music install's result. */
export function musicImportTitle(result: MusicImportResult): string {
  return result.outcome === 'update' ? t('armariumMusic.done.updatedTitle') : t('armariumMusic.done.addedTitle');
}

/** What a music install did, in a sentence, and the old files the trash did not take, which are back in the folder. */
export function describeMusicImport(result: MusicImportResult): string {
  const values = { name: result.name, version: result.version };
  const done = result.outcome === 'update' ? t('armariumMusic.done.updated', values) : t(result.outcome === 'same' ? 'armariumMusic.done.same' : 'armariumMusic.done.added', values);
  if (result.putBack.length === 0) return done;
  return `${done} ${t('armariumMusic.done.putBack', { count: result.putBack.length, files: formatList(result.putBack) })}`;
}
