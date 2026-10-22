// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bestiaryLookup } from '../../../../src/app/creatures/linkedCreature';
import { autoTemplate } from '../../../../src/app/statblocks/model/autoTemplate';
import { resolveStatblock, type VaultResolveContext } from '../../../../src/app/statblocks/resolve/resolveStatblock';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { addNote, creatureVault, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_ID, RENAMED_HP, libraryEntry, lookupOf } from '../library/templateTexts';

const WARDEN = 'Bestiary/Marsh Warden.md';
const NATIVE = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', size: 'Large', hp: 30 };
const { hp: _hp, ...WITHOUT_HP } = NATIVE;
const MARSH_MEANINGS = { size: 'size', 'creature-type': 'type', armor: 'ac', 'hit-points': 'hp', senses: 'senses', rating: 'cr' };

let current: CreatureVault;
beforeEach(() => { current = creatureVault(); });
afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

const withMarsh = { templates: lookupOf(libraryEntry(MARSH_CREATURE, 'Marsh creature')) };
const resolve = (path: string, context: VaultResolveContext = withMarsh) => resolveStatblock(current.app, path, context);
const withoutFantasyStatblocks = (): void => { Reflect.deleteProperty(window, 'FantasyStatblocks'); };

describe('resolveStatblock: native notes', () => {
  it('reads the note with its template, its name and its meanings', async () => {
    addNote(current, WARDEN, NATIVE);
    expect(await resolve(WARDEN)).toEqual({
      path: WARDEN,
      source: { kind: 'atlas', templateId: MARSH_ID },
      fields: { ...NATIVE, path: WARDEN },
      template: MARSH_CREATURE,
      templateStatus: 'ok',
      lookName: 'Marsh creature',
      meanings: MARSH_MEANINGS,
    });
  });

  it('reads its own frontmatter, never a stale bestiary copy', async () => {
    addNote(current, WARDEN, NATIVE);
    current.bestiary.push({ name: 'Old Warden', path: WARDEN, hp: 5, cr: 9 });
    const resolved = await resolve(WARDEN);
    expect(resolved?.fields).toMatchObject({ name: 'Marsh Warden', hp: 30 });
    expect(resolved?.fields.cr).toBeUndefined();
  });

  it('aliases former keys to the current key and keeps them', async () => {
    const renamed = { templates: lookupOf(libraryEntry(RENAMED_HP, 'Marsh creature')) };
    addNote(current, WARDEN, { ...WITHOUT_HP, hit_points: 22, health: 9 });
    expect((await resolve(WARDEN, renamed))?.fields).toMatchObject({ hp: 22, hit_points: 22, health: 9 });

    addNote(current, 'Bestiary/Older.md', { statblock: true, 'atlas-template': MARSH_ID, health: 9 });
    expect((await resolve('Bestiary/Older.md', renamed))?.fields).toMatchObject({ hp: 9, health: 9 });

    addNote(current, 'Bestiary/Current.md', { ...NATIVE, hit_points: 22 });
    expect((await resolve('Bestiary/Current.md', renamed))?.fields).toMatchObject({ hp: 30, hit_points: 22 });
  });

  it('draws a note whose template is missing with the auto template', async () => {
    addNote(current, 'Bestiary/Nameless.md', { statblock: true, 'atlas-template': 'gone-abc123', hp: 7 });
    const resolved = await resolve('Bestiary/Nameless.md');
    const fields = { statblock: true, 'atlas-template': 'gone-abc123', hp: 7, name: 'Nameless', path: 'Bestiary/Nameless.md' };
    expect(resolved).toEqual({
      path: 'Bestiary/Nameless.md',
      source: { kind: 'atlas', templateId: 'gone-abc123' },
      fields,
      template: autoTemplate(fields),
      templateStatus: 'missing',
      lookName: null,
      meanings: {},
    });
    expect(resolved?.template?.fields.map((field) => field.key)).toEqual(['name', 'hp']);
  });

  it('reads a template of a newer Atlas as it is, marked newer', async () => {
    addNote(current, WARDEN, NATIVE);
    const newer = { ...MARSH_CREATURE, version: 2 };
    const resolved = await resolve(WARDEN, { templates: lookupOf(libraryEntry(newer, 'Marsh creature', 'newer')) });
    expect(resolved).toMatchObject({ template: newer, templateStatus: 'newer', lookName: 'Marsh creature', meanings: MARSH_MEANINGS });
  });

  it('resolves native notes the same with Fantasy Statblocks missing', async () => {
    withoutFantasyStatblocks();
    addNote(current, WARDEN, NATIVE);
    expect(await resolve(WARDEN)).toMatchObject({ templateStatus: 'ok', template: MARSH_CREATURE });
  });
});

describe('resolveStatblock: Fantasy Statblocks notes', () => {
  it('leaves frontmatter statblocks to the plugin while it is loaded', async () => {
    expect(await resolve('Bestiary/Goblin.md')).toEqual({
      path: 'Bestiary/Goblin.md',
      source: { kind: 'fs-frontmatter' },
      fields: { statblock: true, name: 'Goblin', cr: '1/4', layout: 'Basic 5e Layout', path: 'Bestiary/Goblin.md' },
      template: null,
      templateStatus: null,
      lookName: 'Basic 5e Layout',
      meanings: {},
    });
  });

  it('draws frontmatter statblocks with the auto template while the plugin is missing', async () => {
    withoutFantasyStatblocks();
    const resolved = await resolve('Bestiary/Goblin.md');
    expect(resolved).toMatchObject({ templateStatus: 'auto', lookName: null, fields: { name: 'Goblin', cr: '1/4' } });
    expect(resolved?.template).toEqual(autoTemplate(resolved!.fields));
  });

  it('keeps the bestiary\'s order: its parse of the note first', async () => {
    current.bestiary.push({ name: 'Goblin Boss', path: 'Bestiary/Goblin.md', cr: 1 });
    expect((await resolve('Bestiary/Goblin.md'))?.fields).toMatchObject({ name: 'Goblin Boss', cr: 1 });
  });

  it('reads fences through the plugin, and inline fences without it', async () => {
    expect(await resolve('Bestiary/Orc.md')).toMatchObject({
      source: { kind: 'fs-fence', params: { name: 'Orc', cr: '1/2' } },
      fields: { name: 'Orc', cr: '1/2', path: 'Bestiary/Orc.md' },
      template: null,
      templateStatus: null,
    });
    withoutFantasyStatblocks();
    expect(await resolve('Bestiary/Orc.md')).toMatchObject({ templateStatus: 'auto', fields: { name: 'Orc', cr: '1/2' } });
  });

  it('cannot read a fence that only names a creature while the plugin is missing', async () => {
    withoutFantasyStatblocks();
    current.files.set('Bestiary/Toad.md', '```statblock\ncreature: Giant Toad\n```');
    expect(await resolve('Bestiary/Toad.md')).toBeNull();
  });

  it('finds a bestiary creature of the note\'s name, as token links always have', async () => {
    Object.assign(window, {
      FantasyStatblocks: {
        getBestiaryCreatures: () => [],
        hasCreature: (name: string) => name === 'Plain',
        getCreatureFromBestiary: () => ({ name: 'Plain', cr: 2 }),
      },
    });
    expect(await resolve('Notes/Plain.md')).toMatchObject({
      source: { kind: 'fs-fence', params: { creature: 'Plain' } },
      fields: { name: 'Plain', cr: 2 },
      template: null,
    });
  });

  it('knows notes that define no statblock', async () => {
    withoutFantasyStatblocks();
    expect(await resolve('Notes/Plain.md')).toBeNull();
    expect(await resolve('Nowhere.md')).toBeNull();
  });

  it('reads the bestiary once for a lookup it is given', async () => {
    const bestiary = bestiaryLookup();
    current.getBestiaryCreatures.mockClear();
    await resolve('Bestiary/Goblin.md', { ...withMarsh, bestiary });
    await resolve('Bestiary/Orc.md', { ...withMarsh, bestiary });
    expect(current.getBestiaryCreatures).not.toHaveBeenCalled();
  });
});
