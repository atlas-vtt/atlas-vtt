import type { Translations } from '.';
import { en } from './locales/en';
import de from './locales/de?translation';
import es from './locales/es?translation';
import fr from './locales/fr?translation';
import it from './locales/it?translation';
import pt from './locales/pt?translation';
import ru from './locales/ru?translation';
import zh from './locales/zh?translation';
import type { Translation } from './types';

/** A record whose languages are read when first asked for: only the one Obsidian speaks ever is (`vite/locale-translations.mts`). */
function onFirstUse(languages: Readonly<Record<string, () => Translation>>): Translations {
  const translations: Record<string, Translation> = {};
  for (const [code, load] of Object.entries(languages)) {
    Object.defineProperty(translations, code, { enumerable: true, get: load });
  }
  return translations;
}

/**
 * Languages Atlas speaks, keyed by Obsidian's language codes; a new language is registered here. A regional
 * code without its own entry takes its base language (`pt-BR` and `pt` both read `pt`, written in Brazilian Portuguese).
 */
export const TRANSLATIONS: Translations = onFirstUse({ de, en: () => en, es, fr, it, pt, ru, zh });
