import { describe, expect, it } from 'vitest';
import type { Translations } from '../../src/app/i18n';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { en } from '../../src/app/i18n/locales/en';
import { MISSING, packLocales, unpackLocales, type PackedLocales } from '../../src/app/i18n/packedLocale';
import type { Translation } from '../../src/app/i18n/types';

/** A table with keys of its own, as the real ones have English's. */
function table(texts: Record<string, unknown>): Translation {
  return texts as Translation;
}

/** `packed` as a build stores it and the plugin reads it again: through JSON. */
function stored(packed: PackedLocales): PackedLocales {
  return JSON.parse(JSON.stringify(packed)) as PackedLocales;
}

function roundTrip(translations: Translations, source: string): Translations {
  const origin = translations[source];
  if (!origin) throw new Error(`no ${source} table`);
  return unpackLocales(origin, stored(packLocales(translations, source)));
}

const source = table({ 'a.one': 'One', 'a.count': { one: '{count} thing', other: '{count} things' }, 'b.long': 'A long text', 'b.last': 'Last' });

describe('packed languages', () => {
  it('gives back every language of Atlas as it is, text for text', () => {
    const unpacked = roundTrip(TRANSLATIONS, 'en');

    expect(Object.keys(unpacked)).toEqual(Object.keys(TRANSLATIONS));
    expect(unpacked.en).toBe(en);
    for (const [code, original] of Object.entries(TRANSLATIONS)) {
      const texts = unpacked[code] ?? {};
      expect(texts, code).toEqual(original);
      expect(Object.keys(texts).length, code).toBe(Object.keys(original).length);
      expect(Object.keys(en).filter((key) => key in texts), code).toEqual(Object.keys(en).filter((key) => key in original));
    }
  });

  it('writes the keys of Atlas\' languages once: a packed language is its texts in English\'s order', () => {
    const packed = packLocales(TRANSLATIONS, 'en');
    const keys = Object.keys(en);

    expect(packed.keyCount).toBe(keys.length);
    for (const [code, language] of packed.languages) {
      if (code === 'en') expect(language).toBeNull();
      else expect(Object.keys(language ?? {}), code).toEqual(['values']);
      expect(language?.values.length ?? keys.length, code).toBe(keys.length);
    }
  });

  it('keeps a missing key missing, so it still falls back to English at lookup', () => {
    const translations = { xx: table({ 'b.last': 'Zuletzt', 'a.one': 'Eins' }), en: source };

    const packed = packLocales(translations, 'en');
    const unpacked = unpackLocales(source, stored(packed)).xx ?? {};

    expect(packed.languages[0]).toEqual(['xx', { values: ['Eins', MISSING, MISSING, 'Zuletzt'] }]);
    expect(unpacked).toEqual({ 'a.one': 'Eins', 'b.last': 'Zuletzt' });
    expect('a.count' in unpacked).toBe(false);
    expect(Object.hasOwn(unpacked, 'b.long')).toBe(false);
    expect(Object.keys(unpacked)).toEqual(['a.one', 'b.last']);
  });

  it('keeps plural forms, each language with its own categories', () => {
    const forms = { one: '{count} вещь', few: '{count} вещи', many: '{count} вещей', other: '{count} вещи' };

    expect(roundTrip({ en: source, ru: table({ 'a.count': forms }) }, 'en').ru).toEqual({ 'a.count': forms });
  });

  it('keeps the texts a language holds under keys English lacks', () => {
    const extra = JSON.parse('{"a.one":"Eins","z.own":"Eigenes","__proto__":"Vorlage","z.forms":{"other":"viele"}}') as Translation;

    const packed = packLocales({ en: source, xx: extra }, 'en');
    const unpacked = unpackLocales(source, stored(packed)).xx ?? {};

    expect(packed.languages[1]?.[1]?.values).toEqual(['Eins', MISSING, MISSING, MISSING]);
    expect(Object.keys(unpacked)).toEqual(['a.one', 'z.own', '__proto__', 'z.forms']);
    expect(Object.entries(unpacked)).toEqual(Object.entries(extra));
    expect(Object.getPrototypeOf(unpacked)).toBe(Object.prototype);
  });

  it('marks a missing text with a value no text can be, which JSON holds', () => {
    expect(JSON.parse(JSON.stringify([MISSING]))).toEqual([MISSING]);
    for (const [code, language] of Object.entries(TRANSLATIONS)) {
      const kinds = new Set(Object.values(language).map((text) => (text === null ? 'null' : typeof text)));
      expect([...kinds].sort(), code).toEqual(['object', 'string']);
    }
    for (const value of [MISSING, 1, null, undefined, true, ['a'], { other: 1 }, { other: { nested: 'a' } }]) {
      expect(() => packLocales({ en: source, xx: table({ 'a.one': value }) }, 'en'), String(value)).toThrow('xx: "a.one" is neither a text nor its plural forms');
    }
  });

  it('keeps texts that only look like the mark for a missing one', () => {
    const lookalikes = table({ 'a.one': '0', 'a.count': { other: '0' }, 'b.long': '', 'b.last': 'null' });

    const unpacked = roundTrip({ xx: lookalikes, en: source }, 'en').xx ?? {};

    expect(unpacked).toEqual(lookalikes);
    expect(Object.keys(unpacked)).toHaveLength(4);
  });

  it('hands the source table on as it is, under every code it is registered with', () => {
    const unpacked = roundTrip({ en: source, 'en-GB': source, xx: table({}) }, 'en');

    expect(unpacked.en).toBe(source);
    expect(unpacked['en-GB']).toBe(source);
    expect(unpacked.xx).toEqual({});
  });

  it('refuses to pack against a language that is not registered', () => {
    expect(() => packLocales({ de: source }, 'en')).toThrow('"en" is not among the languages');
  });

  it('refuses to unpack against other keys than it was packed for, rather than show a text under the wrong key', () => {
    const packed = stored(packLocales({ en: source, xx: table({ 'a.one': 'Eins', 'b.last': 'Zuletzt' }) }, 'en'));
    const entries = Object.entries(source);
    const reordered = table(Object.fromEntries([...entries.slice(1), ...entries.slice(0, 1)]));
    const renamed = table(Object.fromEntries(entries.map(([key, text]) => [key === 'b.last' ? 'b.final' : key, text])));
    const shorter = table(Object.fromEntries(entries.slice(0, 3)));
    const longer = table({ ...source, 'c.new': 'New' });

    expect(unpackLocales(table({ ...source }), packed).xx).toEqual({ 'a.one': 'Eins', 'b.last': 'Zuletzt' });
    for (const other of [reordered, renamed, shorter, longer, table({})]) {
      expect(() => unpackLocales(other, packed)).toThrow(/^Atlas' translations were packed for 4 source texts \(\w+\), but this build holds \d+ \(\w+\)\. Build the plugin again\.$/);
    }
  });
});
