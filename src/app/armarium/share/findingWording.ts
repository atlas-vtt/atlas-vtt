import type { MessageKey } from '../../i18n/types';

/**
 * The findings whose sentence for a collection names one or asks for an export, said for what Atlas packs itself (a
 * single file, music): what is wrong, and to share it again. Each has its sentence `armariumFindings.item.<code>`.
 */
const ITEM_CODES = [
  'path-duplicate', 'path-not-normalised', 'file-type', 'checksum-missing', 'manifest-not-export', 'export-outdated', 'manifest-damaged',
  'manifest-cover', 'manifest-own-file', 'zip-not-a-zip', 'zip-too-large', 'zip-too-many-entries', 'zip-entry-too-large', 'zip-total-too-large',
  'zip-duplicate-entry', 'zip-encrypted', 'zip-zip64', 'zip-symlink', 'zip-trailing-data', 'zip-size-mismatch', 'zip-method', 'json-invalid',
  'json-duplicate-key', 'json-shape', 'json-data-url', 'json-forbidden-key', 'file-missing', 'file-unlisted', 'checksum-mismatch',
  'check-too-slow', 'check-internal', 'listing-not-yours', 'version-not-higher',
] as const;

/** Where music asks for something else than a single file: fewer tracks, shorter titles, nothing to take out by hand. */
const MUSIC_CODES = ['zip-too-large', 'zip-total-too-large', 'check-too-slow', 'json-forbidden-key'] as const;

const itemKey = (code: (typeof ITEM_CODES)[number]): MessageKey => `armariumFindings.item.${code}`;
const musicKey = (code: (typeof MUSIC_CODES)[number]): MessageKey => `armariumFindings.music.${code}`;

export const ITEM_FINDINGS: Readonly<Partial<Record<MessageKey, MessageKey>>> = {
  ...Object.fromEntries(ITEM_CODES.map((code) => [`armariumFindings.code.${code}`, itemKey(code)])),
  'armariumFindings.detail.fileTypeNamed': 'armariumFindings.item.fileTypeNamed',
  'armariumFindings.detail.rebuildTooManyPaths': 'armariumFindings.item.rebuildTooManyPaths',
};

export const MUSIC_FINDINGS: Readonly<Partial<Record<MessageKey, MessageKey>>> = {
  ...ITEM_FINDINGS,
  ...Object.fromEntries(MUSIC_CODES.map((code) => [`armariumFindings.code.${code}`, musicKey(code)])),
  'armariumFindings.detail.rebuildTooManyPaths': 'armariumFindings.music.rebuildTooManyPaths',
};
