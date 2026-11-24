import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { en } from '../../src/app/i18n/locales/en';
import { packLocales, unpackLocales, type PackedLocales } from '../../src/app/i18n/packedLocale';
import { isRegistry, localePack, packedRegistry } from '../../vite/locale-pack.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const REGISTRY = 'src/app/i18n/languages.ts';
const REPORT = 'ATLAS_LOCALE_PACK_REPORT';

type Load = (id: string) => Promise<{ code: string } | null>;
type GenerateBundle = (this: { error: (message: string) => never; getModuleIds: () => IterableIterator<string> }) => void;
interface Build { root?: string; production?: boolean; watch?: boolean }

/** The plugin's hooks in a build of the project at `root`: a production build that runs once, unless told otherwise. */
function hooks({ root = ROOT, production = true, watch = false }: Build = {}): { load: Load; generateBundle: (modules: readonly string[]) => void } {
  const plugin = localePack();
  (plugin.configResolved as (config: unknown) => void)({ root, isProduction: production, build: { watch: watch ? {} : null }, resolve: { alias: [] } });
  const fail = (message: string): never => { throw new Error(message); };
  return {
    load: plugin.load as Load,
    generateBundle: (modules) => (plugin.generateBundle as GenerateBundle).call({ error: fail, getModuleIds: () => modules.values() }),
  };
}

/** What a registry module written by the plugin hands to `unpackLocales`. */
function packedIn(code: string): PackedLocales {
  const literal = /JSON\.parse\((".*")\)\);\n$/s.exec(code)?.[1] ?? '""';
  return JSON.parse(JSON.parse(literal) as string) as PackedLocales;
}

/** Every property name anywhere in `value`. */
function namesIn(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => namesIn(item, found));
  else if (typeof value === 'object' && value !== null) {
    for (const [name, item] of Object.entries(value)) namesIn(item, found.add(name));
  }
  return found;
}

/** A project whose registry is `source`, for builds that must fail. */
function projectWith(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-locale-pack-'));
  fs.mkdirSync(path.join(root, path.dirname(REGISTRY)), { recursive: true });
  fs.writeFileSync(path.join(root, REGISTRY), source);
  return root;
}

describe('the languages as a production build packs them', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-locale-report-'));
  const report = path.join(scratch, 'report.json');
  const build = hooks();
  let code = '';

  beforeAll(async () => {
    process.env[REPORT] = report;
    try {
      code = (await build.load(path.join(ROOT, REGISTRY)))?.code ?? '';
    } finally {
      delete process.env[REPORT];
    }
  });

  afterAll(() => fs.rmSync(scratch, { recursive: true }));

  it('reads the tables by running the registry, and writes one that unpacks to the same tables', () => {
    const unpacked = unpackLocales(en, packedIn(code));

    expect(Object.keys(unpacked)).toEqual(Object.keys(TRANSLATIONS));
    expect(unpacked).toEqual(TRANSLATIONS);
    expect(code.split('\n').slice(0, 2)).toEqual(["import { en } from './locales/en';", "import { unpackLocales } from './packedLocale';"]);
  });

  it('holds what the same pack function makes of the source, and reports it where it is asked to', () => {
    const packed = JSON.parse(JSON.stringify(packLocales(TRANSLATIONS, 'en'))) as PackedLocales;

    expect(packedIn(code)).toEqual(packed);
    expect(JSON.parse(fs.readFileSync(report, 'utf8'))).toEqual(packed);
    expect(code).toBe(packedRegistry(packed));
  });

  it('writes no key of English into the registry: every name in it is the pack\'s own or a plural form', () => {
    const own = ['keyCount', 'keyHash', 'languages', 'values'];
    const forms = ['zero', 'one', 'two', 'few', 'many', 'other'];

    expect([...namesIn(packedIn(code))].filter((name) => !own.includes(name) && !forms.includes(name))).toEqual([]);
    expect(code.split('\n')).toHaveLength(4);
  });

  it('passes a build that packed its registry, and fails one that holds it as the source has it', () => {
    const modules = [path.join(ROOT, 'main.ts'), path.join(ROOT, REGISTRY)];

    expect(() => build.generateBundle(modules)).not.toThrow();
    expect(() => hooks().generateBundle(modules)).toThrow('is in the bundle with every language\'s keys');
    expect(() => hooks().generateBundle([`C:\\atlas\\${REGISTRY.replaceAll('/', '\\')}?v=1`])).toThrow('review vite/locale-pack.mts');
    expect(() => hooks().generateBundle([path.join(ROOT, 'tests/fixtures/desktop-runtime.ts')])).not.toThrow();
  });
});

describe('what the language packing leaves alone', () => {
  it('takes the registry of its own project, however the bundler writes the path, and no other module', () => {
    expect(isRegistry(ROOT, path.join(ROOT, REGISTRY))).toBe(true);
    expect(isRegistry(ROOT, `${path.join(ROOT, REGISTRY)}?v=1`)).toBe(true);
    expect(isRegistry('C:/Users/gm/atlas-vtt', 'C:/Users/gm/atlas-vtt/src/app/i18n/languages.ts', path.win32)).toBe(true);
    expect(isRegistry('C:/Users/gm/atlas-vtt', 'c:\\Users\\gm\\atlas-vtt\\src\\app\\i18n\\languages.ts?v=1', path.win32)).toBe(true);
    expect(isRegistry(ROOT, path.join(ROOT, 'src/app/i18n/index.ts'))).toBe(false);
    expect(isRegistry(ROOT, path.join(ROOT, 'src/app/i18n/locales/de/index.ts'))).toBe(false);
    expect(isRegistry(ROOT, path.join(ROOT, 'node_modules/other', REGISTRY))).toBe(false);
    expect(isRegistry('C:/Users/gm/atlas-vtt', 'D:\\other\\src\\app\\i18n\\languages.ts', path.win32)).toBe(false);
  });

  it('leaves every module but the registry to the bundler', async () => {
    const { load } = hooks();

    expect(await load(path.join(ROOT, 'src/app/i18n/locales/de/index.ts'))).toBeNull();
    expect(await load(`\0${path.join(ROOT, REGISTRY)}`)).toBeNull();
  });

  it('leaves watch builds and builds that are not for production as they are', async () => {
    const watching = hooks({ watch: true });
    const development = hooks({ production: false });
    const modules = [path.join(ROOT, REGISTRY)];

    expect(await watching.load(modules[0] ?? '')).toBeNull();
    expect(await development.load(modules[0] ?? '')).toBeNull();
    expect(() => watching.generateBundle(modules)).not.toThrow();
    expect(() => development.generateBundle(modules)).not.toThrow();
  });
});

describe('a build whose languages cannot be packed', () => {
  const projects: string[] = [];
  const failure = async (source: string | null): Promise<unknown> => {
    const root = source === null ? fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-locale-pack-')) : projectWith(source);
    projects.push(root);
    return hooks({ root }).load(path.join(root, REGISTRY)).catch((error: unknown) => error);
  };

  afterAll(() => projects.forEach((root) => fs.rmSync(root, { recursive: true })));

  it('fails, and says why, instead of shipping other texts or none', async () => {
    const start = `Could not pack the languages of ${REGISTRY}: `;

    expect(await failure('export const TRANSLATIONS = { en: { a: "A" }, de: { a: 1 } };')).toMatchObject({ message: `${start}de: "a" is neither a text nor its plural forms, so the language cannot be packed` });
    expect(await failure('export const LANGUAGES = {};')).toMatchObject({ message: `${start}it exports no TRANSLATIONS` });
    expect(await failure('export const TRANSLATIONS = { de: { a: "A" } };')).toMatchObject({ message: `${start}"en" is not among the languages` });
    expect(await failure(null)).toMatchObject({ message: expect.stringContaining(start) });
  });
});
