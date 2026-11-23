import { rolldown } from 'rolldown';
import type { Plugin } from 'vite';

const QUERY = '?translation';

/** A language's texts as JSON (its locale module bundled on its own and run), and the files it was read from. */
async function translationJson(entry: string): Promise<{ json: string; files: string[] }> {
  const bundle = await rolldown({ input: entry, logLevel: 'silent' });
  try {
    const { output } = await bundle.generate({ format: 'cjs' });
    const module = { exports: {} as Record<string, unknown> };
    new Function('module', 'exports', output[0].code)(module, module.exports);
    const values = Object.values(module.exports);
    if (values.length !== 1 || typeof values[0] !== 'object' || values[0] === null) {
      throw new Error(`${entry} should export one translation`);
    }
    return { json: JSON.stringify(values[0]), files: output[0].moduleIds };
  } finally {
    await bundle.close();
  }
}

/**
 * `import load from './locales/de?translation'`: a function that returns the language's texts.
 *
 * Every language was evaluated at every start to pick one: 2.3 MB of object literals that
 * V8 compiled and built in some 70 ms while Obsidian waited for the plugin. As one JSON text
 * a language costs a fraction of that (about 20 ms for all seven) until it is parsed, when
 * it is picked.
 */
export function localeTranslations(): Plugin {
  return {
    name: 'atlas-locale-translations',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith(QUERY)) return null;
      const { json, files } = await translationJson(id.slice(0, -QUERY.length));
      for (const file of files) this.addWatchFile(file);
      return `let texts;\nexport default function load() {\n  return (texts ??= JSON.parse(${JSON.stringify(json)}));\n}\n`;
    },
  };
}
