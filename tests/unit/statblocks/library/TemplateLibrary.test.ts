// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { WORK_SLICE_MS } from '../../../../src/app/utils/workSlices';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { withHeader } from '../../../../src/app/statblocks/model/headerDuplicates';
import { creatureVault, forbidWrites, type CreatureVault } from '../../../mocks/creatureVault';
import { BUILT_IN, MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER, marshText } from './templateTexts';

const SWAMP_ID = 'swamp-beast-a1b2c3';
const SWAMP_PATH = 'Campaigns/Marsh/Swamp beast.atlastemplate';

let current: CreatureVault;
let library: TemplateLibrary | null = null;

function open(): TemplateLibrary {
  library = new TemplateLibrary(current.app, { builtIns: [BUILT_IN] });
  return library;
}

async function loaded(target: TemplateLibrary): Promise<void> {
  await vi.waitFor(() => expect(target.isLoading()).toBe(false));
}

/** Waits until the library has read `path` and `check` holds. */
async function settled(check: () => void): Promise<void> {
  await vi.waitFor(check);
}

beforeEach(() => {
  current = creatureVault();
  current.files.set(MARSH_PATH, marshText());
});

afterEach(() => {
  library?.destroy();
  library = null;
  TemplateLibrary.release(current.app);
  Reflect.deleteProperty(window, 'FantasyStatblocks');
  Reflect.deleteProperty(window, 'scheduler');
  vi.restoreAllMocks();
});

/** Uses up the slice at every read, and hands the browser's turns to `turn`, which counts them. */
function turnAfterEveryRead(turn: () => Promise<void> = async () => undefined): ReturnType<typeof vi.fn> {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (now += WORK_SLICE_MS));
  const asked = vi.fn(turn);
  Object.assign(window, { scheduler: { yield: asked } });
  return asked;
}

const aTask = (): Promise<void> => new Promise((resolve) => { window.setTimeout(resolve, 0); });

describe('TemplateLibrary: reading', () => {
  it('reads every .atlastemplate file wherever it lies, beside the built-ins', async () => {
    current.files.set(SWAMP_PATH, marshText({ id: SWAMP_ID }));
    current.files.set('Campaigns/Marsh/notes.json', '{}');
    const target = open();
    expect(target.isLoading()).toBe(true);
    await loaded(target);

    expect(target.get(MARSH_ID)).toEqual({ template: withHeader(MARSH_CREATURE), name: 'Marsh creature', status: 'ok', builtIn: false, path: MARSH_PATH });
    expect(target.get(SWAMP_ID)).toMatchObject({ name: 'Swamp beast', path: SWAMP_PATH });
    expect(target.get(BUILT_IN.id)).toEqual({ template: BUILT_IN.template, name: 'Test creature', status: 'ok', builtIn: true, path: null });
    expect(target.get('unknown-abc123')).toBeNull();
    expect(target.list().map((entry) => entry.name)).toEqual(['Test creature', 'Marsh creature', 'Swamp beast']);
    expect(target.getSnapshot()).toMatchObject({ loading: false, duplicates: new Map() });
    expect([...target.getSnapshot().files.keys()].sort()).toEqual([SWAMP_PATH, MARSH_PATH].sort());
  });

  it('waits for the workspace layout before it reads the vault', () => {
    let ready: () => void = () => undefined;
    current.app.workspace.onLayoutReady = vi.fn((callback: () => void) => { ready = callback; });
    const target = open();
    expect(current.app.vault.getFiles).not.toHaveBeenCalled();
    ready();
    expect(current.app.vault.getFiles).toHaveBeenCalledTimes(1);
    expect(target.isLoading()).toBe(true);
  });

  it('gives the browser a turn while it reads many templates', async () => {
    for (let number = 0; number < 120; number++) {
      current.files.set(`Templates/T${number}.atlastemplate`, marshText({ id: `t${number}-abc123` }));
    }
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (now += 1));
    const target = open();
    let turns = 0;
    const timer = setInterval(() => { if (target.isLoading()) turns += 1; }, 0);
    await loaded(target);
    clearInterval(timer);
    clock.mockRestore();

    expect(target.get('t119-abc123')).not.toBeNull();
    expect(turns).toBeGreaterThan(3);
  });

  it('reads a template of a newer Atlas read-only', async () => {
    current.files.set(MARSH_PATH, marshText({ version: 2 }));
    const target = open();
    await loaded(target);
    expect(target.get(MARSH_ID)).toMatchObject({ status: 'newer', template: { version: 2 } });
    expect(target.fileAt(MARSH_PATH)?.status).toBe('newer');
  });

  it('refuses a file that claims a built-in id, so disk never shadows a built-in', async () => {
    current.files.set('Templates/Fake.atlastemplate', marshText({ id: BUILT_IN.id }));
    current.files.set('Templates/Other.atlastemplate', marshText({ id: 'builtin:not-shipped' }));
    const target = open();
    await loaded(target);

    expect(target.get(BUILT_IN.id)).toMatchObject({ builtIn: true, path: null });
    expect(target.get('builtin:not-shipped')).toBeNull();
    expect(target.fileAt('Templates/Fake.atlastemplate')).toMatchObject({ status: 'reserved', entry: null, problems: [expect.stringContaining(BUILT_IN.id)] });
    expect(target.list().map((entry) => entry.name)).toEqual(['Test creature', 'Marsh creature']);
  });

  it('keeps what reading each file found, by path', async () => {
    current.files.set('Templates/Broken.atlastemplate', '{ not json');
    const layout = JSON.parse(marshText()).layout as { blocks: unknown[] };
    current.files.set(SWAMP_PATH, marshText({ id: SWAMP_ID, layout: { ...layout, blocks: [...layout.blocks, { id: 'zz00zz00', type: 'stat', field: 'nowhere', look: 'run-in' }] } }));
    const target = open();
    await loaded(target);

    expect(target.fileAt('Templates/Broken.atlastemplate')).toMatchObject({ status: 'invalid', entry: null, name: 'Broken', problems: [expect.stringContaining('not valid JSON')] });
    expect(target.fileAt(SWAMP_PATH)?.status).toBe('ok');
    expect(target.fileAt(SWAMP_PATH)?.problems.join(' ')).toContain('nowhere');
    expect(target.get(SWAMP_ID)).not.toBeNull();
    expect(target.fileAt('Elsewhere.atlastemplate')).toBeNull();
  });
});

describe('TemplateLibrary: duplicates', () => {
  it('lets the lower path hold an id and reports the other as a duplicate, writing nothing', async () => {
    const refusals = forbidWrites(current.app);
    const copy = 'Campaigns/Marsh creature copy.atlastemplate';
    current.files.set(copy, marshText());
    const target = open();
    await loaded(target);

    expect(target.get(MARSH_ID)?.path).toBe(copy);
    expect(target.duplicateOf(MARSH_PATH)).toBe(copy);
    expect(target.duplicateOf(copy)).toBeNull();
    expect(target.getSnapshot().duplicates).toEqual(new Map([[MARSH_PATH, copy]]));
    expect(target.list().filter((entry) => entry.template.id === MARSH_ID)).toHaveLength(1);

    current.files.delete(copy);
    current.vault.trigger('delete', new TFile(copy));
    expect(target.get(MARSH_ID)?.path).toBe(MARSH_PATH);
    expect(target.getSnapshot().duplicates.size).toBe(0);
    for (const refusal of refusals) expect(refusal).not.toHaveBeenCalled();
  });
});

describe('TemplateLibrary: following the vault', () => {
  it('reads a template again when it is edited, and keeps it when the text did not change', async () => {
    const target = open();
    await loaded(target);
    const listener = vi.fn();
    target.subscribe(listener);
    const before = target.get(MARSH_ID);

    current.vault.trigger('modify', new TFile(MARSH_PATH));
    current.files.set(SWAMP_PATH, marshText({ id: SWAMP_ID }));
    current.vault.trigger('create', new TFile(SWAMP_PATH));
    await settled(() => expect(target.get(SWAMP_ID)).not.toBeNull());
    expect(target.get(MARSH_ID)).toBe(before);

    current.files.set(MARSH_PATH, marshText({ description: 'Changed' }));
    current.vault.trigger('modify', new TFile(MARSH_PATH));
    await settled(() => expect(target.get(MARSH_ID)?.template.description).toBe('Changed'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('follows a renamed file and a moved folder without reading them again', async () => {
    const target = open();
    await loaded(target);
    const read = vi.spyOn(current.app.vault, 'cachedRead');
    read.mockClear();

    const renamed = `${TEMPLATE_FOLDER}/Bog creature.atlastemplate`;
    current.files.set(renamed, current.files.get(MARSH_PATH)!);
    current.files.delete(MARSH_PATH);
    current.vault.trigger('rename', new TFile(renamed), MARSH_PATH);
    expect(target.get(MARSH_ID)).toMatchObject({ name: 'Bog creature', path: renamed });
    expect(target.fileAt(MARSH_PATH)).toBeNull();

    const moved = 'Library/Bog creature.atlastemplate';
    current.files.set(moved, current.files.get(renamed)!);
    current.files.delete(renamed);
    current.vault.trigger('rename', new TFolder('Library'), TEMPLATE_FOLDER);
    expect(target.get(MARSH_ID)).toMatchObject({ name: 'Bog creature', path: moved });
    expect(read).not.toHaveBeenCalled();

    current.files.set('Library/Notes.atlastemplate', marshText({ id: SWAMP_ID }));
    current.files.delete('Library/Notes.md');
    current.vault.trigger('rename', new TFile('Library/Notes.atlastemplate'), 'Library/Notes.md');
    await settled(() => expect(target.get(SWAMP_ID)?.name).toBe('Notes'));
  });

  it('forgets a deleted template, and every template of a deleted folder', async () => {
    current.files.set(SWAMP_PATH, marshText({ id: SWAMP_ID }));
    const target = open();
    await loaded(target);
    const listener = vi.fn();
    target.subscribe(listener);

    current.files.delete(MARSH_PATH);
    current.vault.trigger('delete', new TFile(MARSH_PATH));
    expect(target.get(MARSH_ID)).toBeNull();
    current.vault.trigger('delete', new TFolder('Campaigns'));
    expect(target.get(SWAMP_ID)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    current.vault.trigger('delete', new TFile('Notes/Plain.md'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not bring back a template deleted while it was being read', async () => {
    let finish: (text: string) => void = () => undefined;
    vi.spyOn(current.app.vault, 'cachedRead').mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    const target = open();
    current.files.delete(MARSH_PATH);
    current.vault.trigger('delete', new TFile(MARSH_PATH));
    finish(marshText());
    await loaded(target);
    expect(target.get(MARSH_ID)).toBeNull();
    expect(target.fileAt(MARSH_PATH)).toBeNull();
  });

  it('never writes while it reads and follows the vault', async () => {
    const refusals = forbidWrites(current.app);
    const target = open();
    await loaded(target);
    target.list();
    target.getSnapshot();
    current.files.set(MARSH_PATH, marshText({ description: 'Edited elsewhere' }));
    current.vault.trigger('modify', new TFile(MARSH_PATH));
    await settled(() => expect(target.get(MARSH_ID)?.template.description).toBe('Edited elsewhere'));
    current.vault.trigger('rename', new TFile('Moved.atlastemplate'), MARSH_PATH);
    current.vault.trigger('delete', new TFile('Moved.atlastemplate'));
    for (const refusal of refusals) expect(refusal).not.toHaveBeenCalled();
  });
});

describe('TemplateLibrary: one per app', () => {
  it('hands out a stable snapshot until something changes', async () => {
    const target = open();
    await loaded(target);
    const snapshot = target.getSnapshot();
    expect(target.getSnapshot()).toBe(snapshot);
    current.vault.trigger('delete', new TFile(MARSH_PATH));
    expect(target.getSnapshot()).not.toBe(snapshot);
    expect(target.getSnapshot().templates.map((entry) => entry.name)).not.toContain('Marsh creature');
  });

  it('stops following the vault when released', () => {
    const first = TemplateLibrary.forApp(current.app);
    expect(TemplateLibrary.forApp(current.app)).toBe(first);
    expect(current.vault.count()).toBeGreaterThan(0);
    TemplateLibrary.release(current.app);
    expect(current.vault.count()).toBe(0);
    expect(TemplateLibrary.forApp(current.app)).not.toBe(first);
  });

  it('reads nothing more, and asks the browser for no turn, once released during a read', async () => {
    current.files.set(SWAMP_PATH, marshText({ id: SWAMP_ID }));
    const turns = turnAfterEveryRead();
    let finish: (text: string) => void = () => undefined;
    const read = vi.spyOn(current.app.vault, 'cachedRead').mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    const target = open();
    target.destroy();
    finish(marshText());
    await aTask();
    expect(read).toHaveBeenCalledTimes(1);
    expect(turns).not.toHaveBeenCalled();
  });

  it('reads nothing more once released while the browser has its turn', async () => {
    current.files.set(SWAMP_PATH, marshText({ id: SWAMP_ID }));
    let endTurn: () => void = () => undefined;
    const turns = turnAfterEveryRead(() => new Promise<void>((resolve) => { endTurn = resolve; }));
    const read = vi.spyOn(current.app.vault, 'cachedRead');
    const target = open();
    await vi.waitFor(() => expect(turns).toHaveBeenCalledTimes(1));
    target.destroy();
    endTurn();
    await aTask();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
