// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { CreatureIndex } from '../../../../src/app/creatures/CreatureIndex';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { addNote, creatureVault, forbidWrites, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER, marshText } from '../library/templateTexts';

const WARDEN = 'Bestiary/Marsh Warden.md';
const IMP = 'Bestiary/Imp.md';
const SWAMP_ID = 'swamp-beast-a1b2c3';
const SWAMP_PATH = `${TEMPLATE_FOLDER}/Swamp beast.atlastemplate`;

let current: CreatureVault;

beforeEach(() => {
  current = creatureVault();
  current.files.set(MARSH_PATH, marshText());
  current.files.set(SWAMP_PATH, marshText({ id: SWAMP_ID }));
  addNote(current, WARDEN, { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', hp: 30 });
  addNote(current, IMP, { statblock: true, 'atlas-template': SWAMP_ID, name: 'Imp', hp: 3 });
});

afterEach(() => {
  CreatureIndex.release(current.app);
  TemplateLibrary.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
});

async function indexed(paths: string[]): Promise<CreatureIndex> {
  const index = CreatureIndex.forApp(current.app);
  index.request(paths);
  await vi.waitFor(() => {
    expect(TemplateLibrary.forApp(current.app).isLoading()).toBe(false);
    expect(index.isPending()).toBe(false);
    for (const path of paths) expect(index.get(path)?.lookName).not.toBeNull();
  });
  return index;
}

/** How often the metadata cache was asked for a note's frontmatter: once per read of that note. */
function readsOf(path: string, cache: ReturnType<typeof vi.spyOn>): number {
  return cache.mock.calls.filter(([file]) => (file as TFile).path === path).length;
}

describe('CreatureIndex: native statblocks', () => {
  it('indexes a native note with its template id, meanings and template name', async () => {
    current.bestiary.push({ name: 'Old Warden', path: WARDEN, hp: 5 });
    const index = await indexed([WARDEN]);
    expect(index.get(WARDEN)).toMatchObject({
      path: WARDEN,
      templateId: MARSH_ID,
      lookName: 'Marsh creature',
      meanings: { 'hit-points': 'hp', rating: 'cr' },
      fields: { name: 'Marsh Warden', hp: 30 },
    });
  });

  it('reads a template\'s notes again when the template changes, is renamed or is deleted', async () => {
    const index = await indexed([WARDEN, IMP]);
    const listener = vi.fn();
    index.subscribe(listener);

    const fields = (JSON.parse(marshText()) as { fields: Array<Record<string, unknown>> }).fields
      .map((field) => (field.key === 'hp' ? { ...field, key: 'vigour', formerKeys: ['hp'] } : field));
    current.files.set(MARSH_PATH, marshText({ fields }));
    current.vault.trigger('modify', new TFile(MARSH_PATH));
    await vi.waitFor(() => expect(index.get(WARDEN)).toMatchObject({ meanings: { 'hit-points': 'vigour' }, fields: { vigour: 30, hp: 30 } }));

    const renamed = `${TEMPLATE_FOLDER}/Bog creature.atlastemplate`;
    current.files.set(renamed, current.files.get(MARSH_PATH)!);
    current.files.delete(MARSH_PATH);
    current.vault.trigger('rename', new TFile(renamed), MARSH_PATH);
    await vi.waitFor(() => expect(index.get(WARDEN)?.lookName).toBe('Bog creature'));

    current.files.delete(renamed);
    current.vault.trigger('delete', new TFile(renamed));
    await vi.waitFor(() => expect(index.get(WARDEN)).toMatchObject({ templateId: MARSH_ID, lookName: null, meanings: {} }));
    expect(index.get(IMP)?.lookName).toBe('Swamp beast');
    expect(listener).toHaveBeenCalled();
  });

  it('leaves the notes of other templates alone', async () => {
    const cache = vi.spyOn(current.app.metadataCache, 'getFileCache');
    const index = await indexed([WARDEN, IMP]);
    const warden = readsOf(WARDEN, cache);
    const imp = readsOf(IMP, cache);

    current.files.set(SWAMP_PATH, marshText({ id: SWAMP_ID, description: 'Changed' }));
    current.vault.trigger('modify', new TFile(SWAMP_PATH));
    await vi.waitFor(() => expect(readsOf(IMP, cache)).toBeGreaterThan(imp));
    await vi.waitFor(() => expect(index.isPending()).toBe(false));
    expect(readsOf(WARDEN, cache)).toBe(warden);
  });

  it('starts no template library while no native note is read, and never writes', async () => {
    const refusals = forbidWrites(current.app);
    const index = CreatureIndex.forApp(current.app);
    const listening = current.vault.count();
    index.request(['Bestiary/Goblin.md', 'Bestiary/Orc.md']);
    await vi.waitFor(() => expect(index.isPending()).toBe(false));
    expect(current.vault.count()).toBe(listening);

    await indexed([WARDEN]);
    expect(current.vault.count()).toBeGreaterThan(listening);
    for (const refusal of refusals) expect(refusal).not.toHaveBeenCalled();
  });

  it('stops following the library when released', async () => {
    const cache = vi.spyOn(current.app.metadataCache, 'getFileCache');
    await indexed([WARDEN]);
    CreatureIndex.release(current.app);
    const reads = readsOf(WARDEN, cache);
    current.files.delete(MARSH_PATH);
    current.vault.trigger('delete', new TFile(MARSH_PATH));
    expect(TemplateLibrary.forApp(current.app).get(MARSH_ID)).toBeNull();
    expect(readsOf(WARDEN, cache)).toBe(reads);
  });
});
