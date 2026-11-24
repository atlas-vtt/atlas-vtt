import type { Plugin, ResolvedConfig } from 'vite';
import { runnerImport } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Translations } from '../src/app/i18n/index.ts';
import { lazyLocales, packLocales, storeLocales, unpackLocales, type PackedLocales } from '../src/app/i18n/packedLocale.ts';

/** The module that registers every language, from the project root, and the language whose keys the others share. */
const REGISTRY = 'src/app/i18n/languages.ts';
const SOURCE = 'en';
/** Names a file that receives what was packed, as JSON, for checking a build from outside. */
const REPORT = 'ATLAS_LOCALE_PACK_REPORT';

/** Whether `id` is the registry of the project at `root`, however the bundler writes the path (`paths` is Windows' in a test). */
export function isRegistry(root: string, id: string, paths: Pick<typeof path, 'relative'> = path): boolean {
  return paths.relative(root, id.split('?')[0] ?? '').replaceAll('\\', '/') === REGISTRY;
}

/**
 * The registry as the bundle gets it: the source language as it is, and each other language as the JSON text
 * of its packed table, unpacked when that language is first read (`lazyLocales`).
 */
export function packedRegistry(packed: PackedLocales): string {
  // Each table as text for JSON.parse, not as a literal: a literal would take a `__proto__` key for the prototype.
  return [
    `import { ${SOURCE} } from './locales/${SOURCE}';`,
    `import { lazyLocales } from './packedLocale';`,
    `export const TRANSLATIONS = lazyLocales(${SOURCE}, ${JSON.stringify(storeLocales(packed))});`,
    '',
  ].join('\n');
}

/**
 * The languages as the registry exports them, from running the module itself: the tables are spread
 * together from many files, so only evaluation says what a table holds and in which order.
 */
async function registeredLanguages(config: ResolvedConfig): Promise<Translations> {
  const { module } = await runnerImport<{ TRANSLATIONS?: Translations }>(path.resolve(config.root, REGISTRY), {
    root: config.root,
    logLevel: 'error',
    resolve: { alias: config.resolve.alias },
  });
  if (!module.TRANSLATIONS) throw new Error('it exports no TRANSLATIONS');
  return module.TRANSLATIONS;
}

/** `translations` packed, as JSON holds it, once unpacking that gave back every table as it was. */
function verifiedPack(translations: Translations): PackedLocales {
  const source = translations[SOURCE];
  assert.ok(source, `"${SOURCE}" is not among the languages`);
  const pack = JSON.parse(JSON.stringify(packLocales(translations, SOURCE))) as PackedLocales;
  assert.deepStrictEqual(unpackLocales(source, pack), translations, 'the packed languages do not unpack to the same texts');
  const stored = JSON.parse(JSON.stringify(storeLocales(pack))) as ReturnType<typeof storeLocales>;
  assert.deepStrictEqual(Object.fromEntries(Object.entries(lazyLocales(source, stored))), translations, 'the languages as the bundle holds them do not unpack to the same texts');
  return pack;
}

/**
 * Writes every translation key into the bundle once. The languages hold the same keys as English, and
 * as object literals each of them would repeat all of them. A production build therefore gets the
 * registry with English as it is and every other language as its texts alone, in the order of
 * English's keys (`src/app/i18n/packedLocale.ts`), unpacked when it is first read; the tables at run time are
 * the ones the source describes.
 *
 * Watch builds, the tests and anything else that is no production build read the source as it is.
 * A build that cannot read the languages fails, and so does one that holds the registry unpacked.
 */
export function localePack(): Plugin {
  let config: ResolvedConfig;
  let packs = false;
  let done = false;
  return {
    name: 'atlas-locale-pack',
    enforce: 'pre',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
      packs = resolved.isProduction && !resolved.build.watch;
    },
    async load(id) {
      if (!packs || id.startsWith('\0') || !isRegistry(config.root, id)) return null;
      let pack: PackedLocales;
      try {
        pack = verifiedPack(await registeredLanguages(config));
      } catch (cause) {
        throw new Error(`Could not pack the languages of ${REGISTRY}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
      }
      const report = process.env[REPORT];
      if (report) fs.writeFileSync(path.resolve(report), JSON.stringify(pack));
      done = true;
      return { code: packedRegistry(pack), map: null };
    },
    generateBundle() {
      const held = [...this.getModuleIds()].some((id) => id.replaceAll('\\', '/').split('?')[0]?.endsWith(`/${REGISTRY}`));
      if (packs && held && !done) this.error(`${REGISTRY} is in the bundle with every language's keys; review vite/locale-pack.mts`);
    },
  };
}
