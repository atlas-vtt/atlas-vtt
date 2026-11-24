import { afterEach, describe, expect, it } from 'vitest';
import { refusalSaid, shareSaid, type SubjectSentence } from '@/app/armarium/share/shareWording';
import { UPLOAD_ERROR_CODES } from '@/app/armarium/upload/text/uploadMessages';
import { UPLOAD_REFUSALS } from '@/app/armarium/upload/uploadContract';
import { setLocale } from '@/app/i18n';
import { TRANSLATIONS } from '@/app/i18n/languages';

/** How each language says "collection". */
const COLLECTION: Readonly<Record<string, RegExp>> = {
  en: /collection/i, de: /sammlung/i, es: /colecci/i, fr: /collection/i, it: /collezion/i, pt: /coleç/i, ru: /коллекц/i, zh: /合集/,
};

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

  it('asks to confirm that the music may be shared, and a single file that it may', () => {
    expect(refusalSaid('music', { code: 'declaration-missing', until: null }, 'publish')).toBe('Confirm that you may share this music.');
    expect(refusalSaid('item', { code: 'declaration-missing', until: null }, 'publish')).toBe('Confirm that you may share this file.');
    expect(refusalSaid('collection', { code: 'declaration-missing', until: null }, 'publish')).toBe('Confirm that you may share this collection.');
  });

  it('keeps the day a refusal names, in the words of what is shared', () => {
    expect(refusalSaid('music', { code: 'restricted', until: '2030-03-04T12:00:00Z' })).toMatch(/^You cannot share in the Armarium until March 4, 2030\./);
  });
});
