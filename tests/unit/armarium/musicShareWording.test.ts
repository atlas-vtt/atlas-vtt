import { afterEach, describe, expect, it } from 'vitest';
import { findingSaid, refusalSaid, shareSaid, type SubjectSentence } from '@/app/armarium/share/shareWording';
import { UPLOAD_ERROR_CODES } from '@/app/armarium/upload/text/uploadMessages';
import { CHECKER_CODES, RULE_CODES, UPLOAD_REFUSALS, type CheckFinding } from '@/app/armarium/upload/uploadContract';
import { setLocale } from '@/app/i18n';
import { TRANSLATIONS } from '@/app/i18n/languages';

/** How each language says "collection". */
const COLLECTION: Readonly<Record<string, RegExp>> = {
  en: /collection/i, de: /sammlung/i, es: /colecci/i, fr: /collection/i, it: /collezion/i, pt: /coleç/i, ru: /коллекц/i, zh: /合集/,
};

/** How each language says "export": Atlas packs a share itself, so nobody sharing from Atlas is told to export. */
const EXPORT: Readonly<Record<string, RegExp>> = {
  en: /export/i, de: /export/i, es: /export/i, fr: /export/i, it: /esport/i, pt: /export/i, ru: /экспорт/i, zh: /导出/,
};

// What only a collection holds: notes, assets, loot bases, links between files, animated maps, a folder, statblock pictures.
const COLLECTION_ONLY = new Set([
  'note-raw-html', 'note-runs-code', 'note-unsafe-link', 'note-code-language', 'asset-type', 'asset-id', 'asset-path',
  'base-yaml-unsupported', 'base-shape', 'base-expression', 'manifest-folder', 'manifest-statblock-image', 'link-missing-file',
  'video-not-video', 'video-codec', 'video-too-large',
]);
/** Every finding an item or music share can receive, with the details that pick another sentence. */
const FINDINGS: readonly CheckFinding[] = [...RULE_CODES, ...CHECKER_CODES]
  .filter((code) => !COLLECTION_ONLY.has(code))
  .flatMap((code): CheckFinding[] => [
    { code, level: 'error' },
    { code, level: 'warning' },
    ...['exe', 'contents', 'png as webp', 'music-album', 'music-track', 'dice-set'].map((detail) => ({ code, level: 'error' as const, detail })),
  ]);

// A music share packs at least one track (never an empty bundle) and at most ten hours at 96 kbit/s, far under the
// upload limit: these two say what only a collection meets.
const NEVER_FOR_MUSIC = new Set(['empty-file', 'too-large']);
const CODES = [...UPLOAD_REFUSALS, ...UPLOAD_ERROR_CODES].filter((code) => !NEVER_FOR_MUSIC.has(code));
const SENTENCES: readonly SubjectSentence[] = [
  'armariumShare.signInWhy', 'armariumShare.title.upload', 'armariumShare.packing', 'armariumShare.exportFailed', 'armariumShare.rejected',
  'armariumShare.fixThenShare', 'armariumShare.listingIntro', 'armariumShare.descriptionHint', 'armariumShare.creditsHint', 'armariumShare.leaveBody',
];

afterEach(() => setLocale('en', TRANSLATIONS));

describe('what a share of music says', () => {
  it.each(Object.keys(COLLECTION))('names no collection in any refusal or sentence of its own, in %s', (language) => {
    setLocale(language, TRANSLATIONS);
    const collection = COLLECTION[language]!;
    for (const code of CODES) {
      for (const context of ['share', 'publish'] as const) {
        expect(refusalSaid('music', { code, until: null }, context), code).not.toMatch(collection);
        expect(refusalSaid('item', { code, until: null }, context), code).not.toMatch(collection);
      }
    }
    for (const key of SENTENCES) expect(shareSaid('music', key, { error: 'x' }), key).not.toMatch(collection);
  });

  it.each(Object.keys(COLLECTION))('names no collection and asks for no export in any finding of the checks, in %s', (language) => {
    setLocale(language, TRANSLATIONS);
    const wrong = new Set<string>();
    for (const finding of FINDINGS) {
      for (const subject of ['music', 'item'] as const) {
        const said = findingSaid(subject, finding);
        if (COLLECTION[language]!.test(said) || EXPORT[language]!.test(said)) wrong.add(`${subject} ${finding.code}: ${said}`);
      }
    }
    expect([...wrong]).toEqual([]);
  });

  it('tells a music share refused for its version to share it as the next one', () => {
    expect(findingSaid('music', { code: 'version-not-higher', level: 'error' })).toBe('The listing already has this version or a newer one. Start over to share it as the next version.');
    expect(findingSaid('collection', { code: 'version-not-higher', level: 'error' })).toMatch(/Export the collection with a higher version number/);
  });

  it('asks to confirm that the music may be shared, and a single file that it may', () => {
    expect(refusalSaid('music', { code: 'declaration-missing', until: null }, 'publish')).toBe('Confirm that you may share this music.');
    expect(refusalSaid('item', { code: 'declaration-missing', until: null }, 'publish')).toBe('Confirm that you may share this file.');
    expect(refusalSaid('collection', { code: 'declaration-missing', until: null }, 'publish')).toBe('Confirm that you may share this collection.');
  });

  it('keeps the day a refusal names, in the words of what is shared', () => {
    expect(refusalSaid('music', { code: 'restricted', until: '2030-03-04T12:00:00Z' })).toMatch(/^You cannot share in the Armarium until March 4, 2030\./);
  });
});
