import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder, type App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { SYSTEM_PRESET_FOLDER, freePresetPath, presetText, readPresetText } from '../../src/app/services/systemPresets/presetFiles';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const FOLDER = SYSTEM_PRESET_FOLDER;
const rules = structuredClone(BUILT_IN_SYSTEM_PRESETS[1]!.rules);
const fileText = (entry: Record<string, unknown>): string => `${JSON.stringify({ format: 1, ...entry }, null, 2)}\n`;

type Handler = (...args: unknown[]) => void;

/** An in-memory vault whose events the test sends, as a sync delivering another device's change would. */
function vault(seed: Record<string, string> = {}): {
  app: App;
  files: Map<string, string>;
  presets: SystemPresetFiles;
  emit: (name: string, ...args: unknown[]) => void;
} {
  const { app, files } = createInMemoryApp({ files: seed });
  const handlers = new Map<string, Handler[]>();
  vi.mocked(app.vault.on).mockImplementation((name: string, handler: Handler) => {
    handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    return {};
  });
  opened.push(app);
  const presets = SystemPresetFiles.open(app);
  return { app, files, presets, emit: (name, ...args) => { for (const handler of handlers.get(name) ?? []) handler(...args); } };
}

const opened: App[] = [];
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const app of opened.splice(0)) SystemPresetFiles.release(app);
  vi.restoreAllMocks();
});

describe('preset file names', () => {
  it('are the preset\'s name, made safe and numbered while taken in any letter case', () => {
    const taken = new Set([`${FOLDER}/homebrew.json`, `${FOLDER}/Homebrew 2.json`]);
    const isTaken = (path: string): boolean => [...taken].some((other) => other.toLowerCase() === path.toLowerCase());
    expect(freePresetPath('Homebrew', isTaken)).toBe(`${FOLDER}/Homebrew 3.json`);
    expect(freePresetPath('Fate: Core / Accelerated', () => false)).toBe(`${FOLDER}/Fate- Core - Accelerated.json`);
    expect(freePresetPath('..', () => false)).toBe(`${FOLDER}/System preset.json`);
  });

  it('hold the format first and read back what was written', () => {
    const text = presetText({ id: 'p1', name: 'Homebrew', rules: {} });
    expect(Object.keys(JSON.parse(text) as object)[0]).toBe('format');
    expect(readPresetText(text)).toMatchObject({ format: 1, id: 'p1', name: 'Homebrew' });
    expect(JSON.parse(presetText({ id: 'p1', format: 3 }))).toMatchObject({ format: 3 });
    expect(readPresetText('{ broken')).toBeNull();
    expect(readPresetText(JSON.stringify({ id: 'builtin:dnd5e' }))).toBeNull();
    expect(readPresetText(JSON.stringify({ name: 'No id' }))).toBeNull();
  });
});

describe('SystemPresetFiles', () => {
  it('writes each preset into a file of its own, named after it', async () => {
    const { presets, files } = vault();
    const service = new SystemPresetService(presets);
    const homebrew = service.create('Homebrew', rules);
    const marsh = service.create('Marsh: Rules', rules);
    await presets.flush();
    expect(JSON.parse(files.get(`${FOLDER}/Homebrew.json`)!)).toMatchObject({ format: 1, id: homebrew.id, name: 'Homebrew', builtIn: false });
    expect(JSON.parse(files.get(`${FOLDER}/Marsh- Rules.json`)!)).toMatchObject({ id: marsh.id });
    expect(service.list().filter((preset) => !preset.builtIn).map((preset) => preset.name)).toEqual(['Homebrew', 'Marsh: Rules']);
  });

  it('reads the files there are, leaving out those that hold no preset, and lets the lower path hold a duplicated id', async () => {
    const { presets } = vault({
      [`${FOLDER}/Homebrew.json`]: fileText({ id: 'p1', name: 'Homebrew', rules }),
      [`${FOLDER}/Homebrew (conflicted copy).json`]: fileText({ id: 'p1', name: 'Copy', rules }),
      [`${FOLDER}/Nested/Fen.json`]: fileText({ id: 'p2', name: 'Fen', rules }),
      [`${FOLDER}/Broken.json`]: '{ not json',
      [`${FOLDER}/notes.md`]: 'Not a preset.',
    });
    await presets.load();
    expect(presets.entries().map((entry) => [entry.id, entry.name])).toEqual([['p1', 'Copy'], ['p2', 'Fen']]);
    expect(presets.pathOf('p1')).toBe(`${FOLDER}/Homebrew (conflicted copy).json`);
    expect(presets.entries()).toBe(presets.entries());
  });

  it('applies an edit to what the file holds, so a field another device wrote meanwhile survives', async () => {
    const path = `${FOLDER}/Homebrew.json`;
    const { presets, files } = vault({ [path]: fileText({ id: 'p1', name: 'Homebrew', rules }) });
    await presets.load();
    files.set(path, fileText({ id: 'p1', name: 'Homebrew', rules, fromTheLaptop: true }));
    new SystemPresetService(presets).update('p1', { ...rules, conditions: [] });
    await presets.flush();
    expect(JSON.parse(files.get(path)!)).toMatchObject({ fromTheLaptop: true, rules: { conditions: [] } });
    expect(presets.entries()[0]).toMatchObject({ fromTheLaptop: true });
  });

  it('renames the file with the preset', async () => {
    const { presets, files } = vault({
      [`${FOLDER}/Homebrew.json`]: fileText({ id: 'p1', name: 'Homebrew', rules }),
      [`${FOLDER}/Fen.json`]: fileText({ id: 'p2', name: 'Fen', rules }),
    });
    await presets.load();
    const service = new SystemPresetService(presets);
    service.rename('p1', 'House-rules');
    await presets.flush();
    expect(files.has(`${FOLDER}/Homebrew.json`)).toBe(false);
    expect(JSON.parse(files.get(`${FOLDER}/House-rules.json`)!)).toMatchObject({ id: 'p1', name: 'House-rules' });
    expect(presets.pathOf('p1')).toBe(`${FOLDER}/House-rules.json`);

    // Another name that makes the same file name takes the next number.
    service.rename('p2', 'House/rules');
    await presets.flush();
    expect(presets.pathOf('p2')).toBe(`${FOLDER}/House-rules 2.json`);
  });

  it('trashes the files of a deleted preset, conflict copies too', async () => {
    const { app, presets, files } = vault({
      [`${FOLDER}/Homebrew.json`]: fileText({ id: 'p1', name: 'Homebrew', rules }),
      [`${FOLDER}/Homebrew 2.json`]: fileText({ id: 'p1', name: 'Homebrew', rules }),
      [`${FOLDER}/Fen.json`]: fileText({ id: 'p2', name: 'Fen', rules }),
    });
    await presets.load();
    new SystemPresetService(presets).delete('p1');
    expect(presets.entries().map((entry) => entry.id)).toEqual(['p2']);
    await presets.flush();
    expect(app.fileManager.trashFile).toHaveBeenCalledTimes(2);
    expect([...files.keys()].filter((path) => path.startsWith(FOLDER))).toEqual([`${FOLDER}/Fen.json`]);
  });

  it('follows files that change on disk and tells its listeners', async () => {
    const path = `${FOLDER}/Homebrew.json`;
    const { presets, files, emit } = vault({ [path]: fileText({ id: 'p1', name: 'Homebrew', rules }) });
    await presets.load();
    const heard = vi.fn();
    presets.onChange(heard);

    files.set(path, fileText({ id: 'p1', name: 'Synced', rules }));
    emit('modify', new TFile(path));
    await settle();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(presets.entries()[0]).toMatchObject({ name: 'Synced' });

    const arrived = `${FOLDER}/Fen.json`;
    files.set(arrived, fileText({ id: 'p2', name: 'Fen', rules }));
    emit('create', new TFile(arrived));
    await settle();
    expect(presets.entries().map((entry) => entry.id)).toEqual(['p2', 'p1']);

    files.delete(path);
    emit('delete', new TFile(path));
    expect(presets.entries().map((entry) => entry.id)).toEqual(['p2']);

    emit('rename', new TFile(`${FOLDER}/Moor.json`), arrived);
    expect(presets.pathOf('p2')).toBe(`${FOLDER}/Moor.json`);
    emit('rename', new TFile('Elsewhere/Moor.json'), `${FOLDER}/Moor.json`);
    expect(presets.entries()).toEqual([]);
    expect(heard).toHaveBeenCalledTimes(5);
  });

  it('recognises its own writes when their events come back', async () => {
    const { presets, files, emit } = vault();
    const service = new SystemPresetService(presets);
    const preset = service.create('Homebrew', rules);
    await presets.flush();
    const heard = vi.fn();
    presets.onChange(heard);
    emit('create', new TFile(`${FOLDER}/Homebrew.json`));
    service.rename(preset.id, 'Homebrew');
    emit('modify', new TFile(`${FOLDER}/Homebrew.json`));
    await settle();
    await presets.flush();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(files.get(`${FOLDER}/Homebrew.json`)).toBe(presetText(presets.entries()[0]!));
  });

  it('forgets every preset of a deleted folder and reads a folder moved in', async () => {
    const { app, presets, files, emit } = vault({ [`${FOLDER}/Sub/Homebrew.json`]: fileText({ id: 'p1', name: 'Homebrew', rules }) });
    await presets.load();
    emit('delete', new TFolder(`${FOLDER}/Sub`));
    expect(presets.entries()).toEqual([]);

    files.set(`${FOLDER}/Moved/Fen.json`, fileText({ id: 'p2', name: 'Fen', rules }));
    emit('rename', new TFolder(`${FOLDER}/Moved`), 'Elsewhere/Moved');
    await settle();
    expect(presets.entries().map((entry) => entry.id)).toEqual(['p2']);
    expect(app.vault.read).toHaveBeenCalled();
  });

  it('writes a new preset under another name when a file took its name meanwhile', async () => {
    const { presets, files } = vault();
    const preset = new SystemPresetService(presets).create('Homebrew', rules);
    files.set(`${FOLDER}/Homebrew.json`, fileText({ id: 'other', name: 'Homebrew', rules }));
    await presets.flush();
    expect(JSON.parse(files.get(`${FOLDER}/Homebrew 2.json`)!)).toMatchObject({ id: preset.id });
    expect(JSON.parse(files.get(`${FOLDER}/Homebrew.json`)!)).toMatchObject({ id: 'other' });
  });
});
