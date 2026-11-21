import type { Translations } from '.';
import { de } from './locales/de';
import { en } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { zh } from './locales/zh';

/**
 * Languages Atlas speaks, keyed by Obsidian's language codes; a new language is registered here. A regional
 * code without its own entry takes its base language (`pt-BR` and `pt` both read `pt`, written in Brazilian Portuguese).
 */
export const TRANSLATIONS: Translations = { de, en, es, fr, it, pt, ru, zh };
