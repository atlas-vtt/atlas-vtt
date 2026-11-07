// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findImportedTemplate, importFsLayout, pluginLayoutResolver, readLayoutText } from '../../../../src/app/statblocks/fs/fsImport';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TEMPLATE_FOLDER } from '../../../../src/app/statblocks/library/templatePaths';
import type { LibraryTemplate } from '../../../../src/app/statblocks/model/resolvedTypes';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { FOOTER_LAYOUT, MARSH_LAYOUT, withFsPlugin, withoutFsPlugin } from './fsImportKit';

let vault: SessionVault;

beforeEach(async () => {
  vault = sessionVault({});
  await vault.settled();
});

afterEach(async () => {
  withoutFsPlugin(vault.app);
  await closeSessionVault(vault);
});

const read = (path: string): StatblockTemplate => JSON.parse(vault.files.get(path)!) as StatblockTemplate;
const templateFiles = (): string[] => [...vault.files.keys()].filter((path) => path.startsWith(`${TEMPLATE_FOLDER}/`)).sort();

describe('importFsLayout', () => {
  it('makes a template of a layout of the plugin, named after it, with its includes, and Track blocks for the tracks its script drew', async () => {
    withFsPlugin(vault.app);
    const imported = await importFsLayout(vault.app, MARSH_LAYOUT);

    expect(imported.path).toBe(`${TEMPLATE_FOLDER}/Marsh layout.atlastemplate`);
    expect(imported.name).toBe('Marsh layout');
    const template = read(imported.path);
    expect(template.id).toBe(imported.id);
    expect(template.importedFrom).toMatchObject({ layoutId: 'marsh-layout', layoutName: 'Marsh layout' });
    // The footer the layout includes came through the plugin.
    expect(template.fields.map((field) => field.key)).toEqual(expect.arrayContaining(['name', 'speed', 'source']));
    // The script that drew Hit points and Stress as boxes became Track blocks; nothing is kept for Fantasy Statblocks.
    expect(imported.report?.scripts).toEqual([]);
    const blocks = flattenReadingOrder(template.layout.blocks);
    expect(blocks.filter((block) => block.type === 'script')).toEqual([]);
    expect(blocks.flatMap((block) => (block.type === 'track' ? [block.field] : []))).toEqual(['hp', 'stress']);
  });

  it('imports a layout once: found again by its id, then by its name', async () => {
    withFsPlugin(vault.app);
    const first = await importFsLayout(vault.app, MARSH_LAYOUT);

    const again = await importFsLayout(vault.app, MARSH_LAYOUT);
    const renamedInFs = await importFsLayout(vault.app, { ...MARSH_LAYOUT, name: 'Bog layout' });
    // A layout file: Fantasy Statblocks gave the exported layout an id of its own.
    const fromFile = await importFsLayout(vault.app, { ...MARSH_LAYOUT, id: 'k2PqXb' });

    for (const later of [again, renamedInFs, fromFile]) expect(later).toEqual({ ...first, report: null });
    expect(templateFiles()).toEqual([first.path]);
  });

  it('makes one template of two imports of a layout started together', async () => {
    const [a, b] = await Promise.all([importFsLayout(vault.app, FOOTER_LAYOUT), importFsLayout(vault.app, FOOTER_LAYOUT)]);
    expect(a.id).toBe(b.id);
    expect(templateFiles()).toEqual([`${TEMPLATE_FOLDER}/Footer layout.atlastemplate`]);
  });

  it('imports a layout file without the plugin, leaving its includes out', async () => {
    const imported = await importFsLayout(vault.app, MARSH_LAYOUT);
    expect(read(imported.path).fields.map((field) => field.key)).not.toContain('source');
    expect(imported.report?.dropped.length).toBeGreaterThan(0);
  });

  it('finds included layouts in the plugin by their exact id or name, never the default in their place', () => {
    withFsPlugin(vault.app);
    const resolve = pluginLayoutResolver(vault.app);
    expect(resolve('footer-layout')).toBe(FOOTER_LAYOUT);
    expect(resolve('Footer layout')).toBe(FOOTER_LAYOUT);
    expect(resolve('nowhere')).toBeNull();
  });
});

describe('findImportedTemplate', () => {
  const entry = (id: string, importedFrom: StatblockTemplate['importedFrom'], builtIn = false): LibraryTemplate => ({
    template: { format: 'atlas-statblock-template', version: 1, id, fields: [], layout: { maxColumns: 2, blocks: [] }, ...(importedFrom && { importedFrom }) },
    name: id, status: 'ok', builtIn, path: builtIn ? null : `${id}.atlastemplate`,
  });

  it('prefers the layout id over the name, and never matches built-ins or empty names', () => {
    const byName = entry('by-name', { layoutId: 'old', layoutName: 'Marsh layout' });
    const byId = entry('by-id', { layoutId: 'marsh-layout', layoutName: 'Renamed' });
    const builtIn = entry('builtin:x', { layoutId: 'marsh-layout', layoutName: 'Marsh layout' }, true);
    expect(findImportedTemplate([builtIn, byName, byId], { id: 'marsh-layout', name: 'Marsh layout' })).toBe(byId);
    expect(findImportedTemplate([builtIn, byName], { id: 'other', name: 'Marsh layout' })).toBe(byName);
    expect(findImportedTemplate([entry('blank', { layoutId: '', layoutName: '' })], { id: '', name: '' })).toBeNull();
    expect(findImportedTemplate([entry('plain', undefined)], { id: 'marsh-layout', name: 'Marsh layout' })).toBeNull();
  });
});

describe('readLayoutText', () => {
  it('reads a layout file and says what is wrong with others', () => {
    expect(readLayoutText(JSON.stringify(MARSH_LAYOUT))).toEqual({ layout: MARSH_LAYOUT });
    // Saved by an editor that writes a byte order mark first.
    expect(readLayoutText(`\uFEFF${JSON.stringify(MARSH_LAYOUT)}`)).toEqual({ layout: MARSH_LAYOUT });
    expect(readLayoutText('{ not json')).toEqual({ problem: 'This file isn\'t valid JSON.' });
    expect(readLayoutText('{"name": "No blocks"}')).toEqual({ problem: 'This file isn\'t a Fantasy Statblocks layout.' });
  });
});

it('keeps the library a template file reads as the import wrote it', async () => {
  const imported = await importFsLayout(vault.app, FOOTER_LAYOUT);
  expect(TemplateLibrary.forApp(vault.app).get(imported.id)?.path).toBe(imported.path);
});
