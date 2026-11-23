import { afterEach, describe, expect, it } from 'vitest';
import { formatMessage, getLocale, resolveLocale, setLocale, setPlatformSource, setPointerSource, t, tPlatform, tPointer } from '../../src/app/i18n';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { en } from '../../src/app/i18n/locales/en';
import type { Message, MessageKey, Translation } from '../../src/app/i18n/types';

/** Every `{name}` a message fills in, over all its plural forms. */
function placeholders(message: Message): string[] {
  const forms = typeof message === 'string' ? [message] : Object.values(message);
  return [...new Set(forms.flatMap((form) => [...form.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!)))].sort();
}

/** `translation` without `key`, as a language that has not translated it yet. */
function withoutKey(translation: Translation, key: MessageKey): Translation {
  const { [key]: _dropped, ...rest } = translation;
  return rest;
}

describe('i18n', () => {
  afterEach(() => {
    setLocale('en', TRANSLATIONS);
    setPointerSource(() => false);
    setPlatformSource(() => false);
  });

  it('resolves Obsidian language codes to a supported language', () => {
    expect(resolveLocale('ru', TRANSLATIONS)).toBe('ru');
    expect(resolveLocale('RU', TRANSLATIONS)).toBe('ru');
    expect(resolveLocale('ru-RU', TRANSLATIONS)).toBe('ru');
    expect(resolveLocale('zh', TRANSLATIONS)).toBe('zh');
    expect(resolveLocale('zh-CN', TRANSLATIONS)).toBe('zh');
    expect(resolveLocale('zh-TW', TRANSLATIONS)).toBe('zh');
    expect(resolveLocale('de-AT', TRANSLATIONS)).toBe('de');
    expect(resolveLocale('es', TRANSLATIONS)).toBe('es');
    expect(resolveLocale('fr', TRANSLATIONS)).toBe('fr');
    expect(resolveLocale('pt', TRANSLATIONS)).toBe('pt');
    expect(resolveLocale('pt-BR', TRANSLATIONS)).toBe('pt');
    expect(resolveLocale('ja', TRANSLATIONS)).toBe('en');
    expect(resolveLocale('', TRANSLATIONS)).toBe('en');
  });

  it('translates into the active language and falls back to English', () => {
    setLocale('ru', TRANSLATIONS);
    expect(getLocale()).toBe('ru');
    expect(t('command.openDashboard')).toBe('Открыть панель');
    setLocale('zh', TRANSLATIONS);
    expect(getLocale()).toBe('zh');
    expect(t('command.openDashboard')).toBe('打开仪表盘');
    expect(t('count.files', { count: 1 })).toBe('1 个文件');
    setLocale('ja', TRANSLATIONS);
    expect(t('command.openDashboard')).toBe('Open dashboard');
  });

  it('picks plural forms by the language rules and fills placeholders', () => {
    const files = { one: '{count} файл', few: '{count} файла', many: '{count} файлов', other: '{count} файла' };
    const russian = new Intl.PluralRules('ru');
    expect(formatMessage(files, russian, { count: 1 })).toBe('1 файл');
    expect(formatMessage(files, russian, { count: 3 })).toBe('3 файла');
    expect(formatMessage(files, russian, { count: 11 })).toBe('11 файлов');
    expect(formatMessage(files, russian, { count: 1.5 })).toBe('1,5 файла');
    const english = new Intl.PluralRules('en');
    expect(formatMessage({ one: '{count} file', other: '{count} files' }, english, { count: 1200 })).toBe('1,200 files');
    expect(formatMessage('Open {name} in {place}', english, { name: 'Map' })).toBe('Open Map in {place}');
    expect(formatMessage({ one: 'a file', other: 'files' }, english)).toBe('files');
  });

  it('words a text for the pointer in use: the mouse\'s, or the finger\'s own sentence', () => {
    expect(tPointer('am.tour.libraryBody')).toBe(t('am.tour.libraryBody'));
    let finger = true;
    setPointerSource(() => finger);
    expect(tPointer('am.tour.libraryBody')).toBe('Tokens, maps, scenes and encounters each have a tab. Create brings in images from this device.');
    // Values fill either wording, and one it does not name is left out.
    expect(tPointer('tour.loot.rollBody', { hotkey: 'L' })).not.toContain('{hotkey}');
    expect(tPointer('tour.loot.rollBody', { hotkey: 'L' })).not.toBe(t('tour.loot.rollBody', { hotkey: 'L' }));
    // A language without the finger's wording shows the English one, as for any missing key.
    setLocale('ru', { ...TRANSLATIONS, ru: withoutKey(TRANSLATIONS.ru!, 'am.tour.libraryBody.touch') });
    expect(tPointer('am.tour.libraryBody')).toBe('Tokens, maps, scenes and encounters each have a tab. Create brings in images from this device.');
    // The pointer is asked at every call: a mouse attached to a tablet gets its own wording back.
    finger = false;
    expect(tPointer('am.tour.libraryBody')).toBe(t('am.tour.libraryBody'));
  });

  it('gives a finger\'s wording only to texts that have a mouse\'s, and names no mouse or key in it', () => {
    const touch = (Object.keys(en) as MessageKey[]).filter((key) => key.endsWith('.touch'));
    expect(touch.length).toBeGreaterThan(0);
    for (const key of touch) {
      const base = key.slice(0, -'.touch'.length);
      expect(base in en, key).toBe(true);
      const text = JSON.stringify(en[key]);
      expect(text, key).not.toMatch(/right-click|shift|\balt\b|ctrl|cmd|hover|double-click|scroll|\bdrop\b|press \{/i);
      // A wording never asks for a value its mouse's text is not given.
      expect(placeholders(en[key]).filter((name) => !placeholders(en[base as MessageKey]).includes(name)), key).toEqual([]);
    }
  });

  it('words a text for the app it runs in: Obsidian mobile, which has no player window, gets its own sentence', () => {
    expect(tPlatform('loot.openPlayerView')).toBe(t('loot.openPlayerView'));
    setPlatformSource(() => true);
    expect(tPlatform('loot.openPlayerView')).toBe('Start an online table to show loot to your players.');
    expect(tPlatform('present.shownElsewhere', { name: 'Tavern' })).toBe('Players see Tavern');
    // A language without the mobile wording shows the English one
    setLocale('ru', { ...TRANSLATIONS, ru: withoutKey(TRANSLATIONS.ru!, 'dice.showRollsToPlayersHint.mobile') });
    expect(tPlatform('dice.showRollsToPlayersHint')).toBe('Your rolls appear in Table mode too.');
  });

  it('gives a mobile wording only to texts that have a desktop one, and names no window in it', () => {
    const mobile = (Object.keys(en) as MessageKey[]).filter((key) => key.endsWith('.mobile'));
    expect(mobile.length).toBeGreaterThan(0);
    for (const key of mobile) {
      const base = key.slice(0, -'.mobile'.length);
      expect(base in en, key).toBe(true);
      expect(JSON.stringify(en[key]), key).not.toMatch(/window|second screen|popout/i);
      expect(placeholders(en[key]).filter((name) => !placeholders(en[base as MessageKey]).includes(name)), key).toEqual([]);
    }
  });

  it('translates only keys the English source has', () => {
    for (const [language, translation] of Object.entries(TRANSLATIONS)) {
      const orphans = Object.keys(translation).filter((key) => !(key in en));
      expect(orphans, language).toEqual([]);
    }
  });

  it('keeps the placeholders of the English text in every translation', () => {
    for (const [language, translation] of Object.entries(TRANSLATIONS)) {
      for (const [key, message] of Object.entries(translation) as [MessageKey, Message][]) {
        expect(placeholders(message), `${language} ${key}`).toEqual(placeholders(en[key]));
      }
    }
  });
});
