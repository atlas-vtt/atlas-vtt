// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { autoTemplate } from '../../../../src/app/statblocks/model/autoTemplate';
import { resolveStatblockText, type TextResolveContext } from '../../../../src/app/statblocks/resolve/resolveStatblockText';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { creatureVault, forbidWrites, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_ID, RENAMED_HP, libraryEntry, lookupOf } from '../library/templateTexts';

const PATH = 'Bundle/Bestiary/Marsh Warden.md';
const NATIVE_TEXT = `---\nstatblock: true\natlas-template: ${MARSH_ID}\nname: Marsh Warden\nhit_points: 22\n---\nA warden of the marsh.\n`;

let current: CreatureVault;
beforeEach(() => { current = creatureVault(); });
afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

const context = (extra: Partial<TextResolveContext> = {}): TextResolveContext => ({ app: current.app, templates: lookupOf(), ...extra });

describe('resolveStatblockText: native notes of a bundle', () => {
  it('finds a template that exists only in the bundle', async () => {
    const resolved = await resolveStatblockText(NATIVE_TEXT, PATH, context({ bundleTemplates: [libraryEntry(RENAMED_HP, 'Marsh creature')] }));
    expect(resolved).toMatchObject({
      path: PATH,
      source: { kind: 'atlas', templateId: MARSH_ID },
      template: RENAMED_HP,
      templateStatus: 'ok',
      lookName: 'Marsh creature',
      fields: { name: 'Marsh Warden', hp: 22, hit_points: 22, path: PATH },
    });
    expect(resolved?.meanings).toMatchObject({ 'hit-points': 'hp' });
  });

  it('prefers the bundle\'s template to the library\'s of the same id, and reads the library\'s otherwise', async () => {
    const library = lookupOf(libraryEntry(MARSH_CREATURE, 'Library copy'));
    const bundled = await resolveStatblockText(NATIVE_TEXT, PATH, context({ templates: library, bundleTemplates: [libraryEntry(RENAMED_HP, 'Bundle copy')] }));
    expect(bundled?.lookName).toBe('Bundle copy');
    expect((await resolveStatblockText(NATIVE_TEXT, PATH, context({ templates: library })))?.lookName).toBe('Library copy');
  });

  it('reads a bundled template of a newer Atlas as it is, marked newer', async () => {
    const newer = { ...MARSH_CREATURE, version: 2 };
    const resolved = await resolveStatblockText(NATIVE_TEXT, PATH, context({ bundleTemplates: [libraryEntry(newer, 'Marsh creature', 'newer')] }));
    expect(resolved).toMatchObject({ template: newer, templateStatus: 'newer', lookName: 'Marsh creature' });
  });

  it('shows a note whose template is nowhere with the auto template, marked missing', async () => {
    const refusals = forbidWrites(current.app);
    const resolved = await resolveStatblockText(NATIVE_TEXT, PATH, context());
    expect(resolved).toMatchObject({ templateStatus: 'missing', lookName: null, meanings: {} });
    expect(resolved?.template).toEqual(autoTemplate(resolved!.fields));
    expect(resolved?.template?.fields.map((field) => field.key)).toEqual(['name', 'hit_points']);
    for (const refusal of refusals) expect(refusal).not.toHaveBeenCalled();
  });
});

describe('resolveStatblockText: Fantasy Statblocks notes', () => {
  const GOBLIN = '---\nstatblock: true\nname: Goblin\ncr: 1/4\nlayout: Basic 5e Layout\n---\n';

  it('leaves frontmatter statblocks to the plugin while it is loaded, and draws them without it', async () => {
    expect(await resolveStatblockText(GOBLIN, 'Bundle/Goblin.md', context())).toMatchObject({
      source: { kind: 'fs-frontmatter' }, template: null, templateStatus: null, lookName: 'Basic 5e Layout',
      fields: { name: 'Goblin', cr: '1/4', path: 'Bundle/Goblin.md' },
    });
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    expect(await resolveStatblockText(GOBLIN, 'Bundle/Goblin.md', context())).toMatchObject({ templateStatus: 'auto', lookName: null });
  });

  it('names a frontmatter statblock after its note when it names nothing', async () => {
    expect((await resolveStatblockText('---\nstatblock: true\nhp: 3\n---\n', 'Bundle/Imp.md', context()))?.fields.name).toBe('Imp');
  });

  it('reads fences through the plugin, and inline fences without it', async () => {
    const orc = '```statblock\nname: Orc\ncr: 1/2\n```';
    expect(await resolveStatblockText(orc, 'Bundle/Orc.md', context())).toMatchObject({
      source: { kind: 'fs-fence' }, template: null, fields: { name: 'Orc', cr: '1/2', path: 'Bundle/Orc.md' },
    });
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    expect(await resolveStatblockText(orc, 'Bundle/Orc.md', context())).toMatchObject({ templateStatus: 'auto' });
    expect(await resolveStatblockText('```statblock\ncreature: Giant Toad\n```', 'Bundle/Toad.md', context())).toBeNull();
  });

  it('knows text that defines no statblock', async () => {
    expect(await resolveStatblockText('# Lore', 'Bundle/Lore.md', context())).toBeNull();
  });
});
