import { afterEach, describe, expect, it } from 'vitest';
import { formatMessage, getLocale, resolveLocale, setLocale, t } from '../../src/app/i18n';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { en } from '../../src/app/i18n/locales/en';
import type { Message, MessageKey } from '../../src/app/i18n/types';

/** Every `{name}` a message fills in, over all its plural forms. */
function placeholders(message: Message): string[] {
  const forms = typeof message === 'string' ? [message] : Object.values(message);
  return [...new Set(forms.flatMap((form) => [...form.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!)))].sort();
}

describe('i18n', () => {
  afterEach(() => setLocale('en', TRANSLATIONS));

  it('resolves Obsidian language codes to a supported language', () => {
    expect(resolveLocale('ru', TRANSLATIONS)).toBe('ru');
    expect(resolveLocale('RU', TRANSLATIONS)).toBe('ru');
    expect(resolveLocale('ru-RU', TRANSLATIONS)).toBe('ru');
    expect(resolveLocale('zh', TRANSLATIONS)).toBe('zh');
    expect(resolveLocale('zh-CN', TRANSLATIONS)).toBe('zh');
    expect(resolveLocale('zh-TW', TRANSLATIONS)).toBe('zh');
    expect(resolveLocale('pt-BR', TRANSLATIONS)).toBe('en');
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
    setLocale('fr', TRANSLATIONS);
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
