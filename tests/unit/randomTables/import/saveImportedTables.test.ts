import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { AssetService } from '../../../../src/app/services/AssetService';
import { saveImportedTables, type ImportSaveJournal } from '../../../../src/app/randomTables/import/saveImportedTables';
import { tablesOfNote } from '../../../../src/app/randomTables/noteTables';

const notes = [
  { id: 0, name: 'Weather', kind: 'text' as const, table: { headers: ['d4', 'Result'], rows: [['1-4', 'Rain']], numbered: true } },
  { id: 1, name: 'Weather', kind: 'text' as const, table: { headers: ['d6', 'Result'], rows: [['1-6', 'Sun']], numbered: true } },
];
afterEach(() => { AssetService.resetInstance(); vi.restoreAllMocks(); });

describe('reviewed table persistence', () => {
  it('writes exactly the selected notes with collision-safe names and persisted references', async () => {
    const { app, files } = createInMemoryApp();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const id = assets.getDefaultCollectionId();
    const result = await saveImportedTables(app, id, notes, new Map());
    expect(result.map((source) => source.path.split('/').at(-1))).toEqual(['Weather.md', 'Weather 2.md']);
    expect(tablesOfNote(files.get(result[1]!.path)!, 'Weather 2').tables[0]?.rows[0]?.cells).toEqual(['Sun']);
    AssetService.resetInstance();
    const reloaded = AssetService.getInstance(app);
    await reloaded.initialize();
    expect(reloaded.getCollectionSettings(id).randomTables).toEqual(result);
  });

  it('reuses created notes when a later note fails, then registers the complete batch on retry', async () => {
    const { app, files } = createInMemoryApp();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const id = assets.getDefaultCollectionId();
    const journal: ImportSaveJournal = new Map();
    const create = vi.mocked(app.vault.create).getMockImplementation()!;
    const spy = vi.spyOn(app.vault, 'create').mockImplementation(async (path, content) => {
      if (path.endsWith('Weather 2.md')) throw new Error('Disk full');
      return create(path, content);
    });
    await expect(saveImportedTables(app, id, notes, journal)).rejects.toThrow('Disk full');
    expect(journal.size).toBe(1);
    spy.mockRestore();
    const saved = await saveImportedTables(app, id, notes, journal);
    expect([...files.keys()].filter((path) => path.includes('/tables/'))).toHaveLength(2);
    expect(assets.getCollectionSettings(id).randomTables).toEqual(saved);
  });

  it('retries a real collection-file write failure even when registration appeared in memory', async () => {
    const { app, files } = createInMemoryApp();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const id = assets.getDefaultCollectionId();
    const journal: ImportSaveJournal = new Map();
    await assets.updateCollectionSettings(id, { randomTables: [] });
    const process = vi.mocked(app.vault.process).getMockImplementation()!;
    const spy = vi.spyOn(app.vault, 'process').mockImplementation(async (file, fn, options) => {
      if (file.path.endsWith('/collection.json')) throw new Error('Disk full');
      return process(file, fn, options);
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(saveImportedTables(app, id, notes, journal)).rejects.toThrow();
    expect(journal.size).toBe(2);
    expect(assets.getCollectionSettings(id).randomTables).toHaveLength(2);
    spy.mockRestore();
    const saved = await saveImportedTables(app, id, notes, journal);
    expect([...files.keys()].filter((path) => path.includes('/tables/'))).toHaveLength(2);
    consoleError.mockRestore();
    AssetService.resetInstance();
    const reloaded = AssetService.getInstance(app);
    await reloaded.initialize();
    expect(reloaded.getCollectionSettings(id).randomTables).toEqual(saved);
  });

  it('validates every selected table before creating any note', async () => {
    const { app, files } = createInMemoryApp();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const invalid = { ...notes[1]!, name: '' };
    await expect(saveImportedTables(app, assets.getDefaultCollectionId(), [notes[0]!, invalid], new Map())).rejects.toThrow();
    expect([...files.keys()].filter((path) => path.includes('/tables/'))).toHaveLength(0);
  });

  it('bounds Unicode file names while keeping the full table heading', async () => {
    const { app, files } = createInMemoryApp();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const name = '漢'.repeat(90);
    const [source] = await saveImportedTables(app, assets.getDefaultCollectionId(), [{ ...notes[0]!, name }], new Map());
    expect(new TextEncoder().encode(source!.path.split('/').at(-1)!.replace(/\.md$/, '')).length).toBeLessThanOrEqual(200);
    expect(tablesOfNote(files.get(source!.path)!, 'Table').tables[0]?.name).toBe(name);
  });
});
