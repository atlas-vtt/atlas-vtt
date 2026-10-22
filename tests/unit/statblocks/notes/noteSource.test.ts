// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { NoteSource, type NoteSnapshot } from '../../../../src/app/statblocks/notes/noteSource';
import { NOTE, NOTE_TEXT, noteHarness, type NoteHarness } from './noteHarness';

let harness: NoteHarness;
let source: NoteSource;

beforeEach(() => {
  harness = noteHarness({ [NOTE]: NOTE_TEXT });
  source = NoteSource.forApp(harness.app);
});

afterEach(() => { NoteSource.release(harness.app); });

const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('NoteSource reading', () => {
  it('reads an open note from its editor, unsaved typing included', () => {
    const view = harness.open(NOTE);
    view.editor.type(NOTE_TEXT.replace('hp: 14', 'hp: 9'));

    expect(source.read(NOTE)).toEqual({
      path: NOTE,
      frontmatter: { name: 'Marsh Warden', hp: 9, ac: 12, image: 'art/warden.webp' },
      origin: 'buffer',
      problem: null,
    });
  });

  it('reads a Reading view from its view data, never from its stale hidden editor', () => {
    const view = harness.open(NOTE, 'preview');
    view.editor.type(NOTE_TEXT.replace('hp: 14', 'hp: 99'));

    expect(source.read(NOTE).frontmatter).toMatchObject({ hp: 14 });
    view.data = NOTE_TEXT.replace('hp: 14', 'hp: 15');
    expect(source.read(NOTE)).toMatchObject({ origin: 'buffer', frontmatter: { hp: 15 } });
  });

  it('reads a closed or deferred note from the metadata cache', () => {
    harness.defer(NOTE);

    expect(source.read(NOTE)).toMatchObject({ origin: 'cache', frontmatter: { hp: 14 }, problem: null });
  });

  it('says when there is no such note', () => {
    expect(source.read('Bestiary/Nobody.md')).toEqual({ path: 'Bestiary/Nobody.md', frontmatter: null, origin: 'none', problem: null });
  });

  it('gives the same snapshot while the frontmatter is unchanged, body typing included', () => {
    const view = harness.open(NOTE);
    const first = source.read(NOTE);

    view.editor.type(`${NOTE_TEXT}More prose.\n`);
    expect(source.read(NOTE)).toBe(first);

    view.editor.type(view.editor.getValue().replace('ac: 12', 'ac: 13'));
    expect(source.read(NOTE)).not.toBe(first);
  });

  it('names the line of a YAML error in the note', () => {
    harness.files.set(NOTE, '---\nname: Warden\nhp: [14\nac: 12\n---\nBody\n');
    harness.open(NOTE);

    expect(source.read(NOTE).problem).toMatchObject({ line: expect.any(Number) as number, message: expect.stringMatching(/YAML error on line \d/) as string });
    expect(source.read(NOTE).problem!.line).toBeGreaterThanOrEqual(3);
  });

  it('tells a watcher of a closed note\'s problem once its text is read', async () => {
    harness.files.set(NOTE, '---\nname: Warden\nhp: [14\n---\n');
    const seen: NoteSnapshot[] = [];
    source.watch(NOTE, (snapshot) => seen.push(snapshot));
    expect(source.read(NOTE).problem).toBeNull();

    await settle();

    expect(seen.at(-1)?.problem?.message).toMatch(/YAML error/);
  });
});

describe('NoteSource watching', () => {
  it('tells watchers of frontmatter edits in the editor, once per burst, and not of body typing', async () => {
    const view = harness.open(NOTE);
    const listener = vi.fn();
    source.watch(NOTE, listener);
    await settle();
    listener.mockClear();

    view.editor.type(`${NOTE_TEXT}Prose.\n`);
    await settle();
    expect(listener).not.toHaveBeenCalled();

    view.editor.type(view.editor.getValue().replace('hp: 14', 'hp: 15'));
    view.editor.type(view.editor.getValue().replace('hp: 15', 'hp: 16'));
    await settle();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ frontmatter: expect.objectContaining({ hp: 16 }) as unknown }));
  });

  it('follows a note that opens in an editor and closes again', async () => {
    const seen: string[] = [];
    source.watch(NOTE, (snapshot) => seen.push(snapshot.origin));
    await settle();

    const view = harness.open(NOTE);
    view.editor.type(NOTE_TEXT.replace('hp: 14', 'hp: 1'));
    await settle();
    harness.close(view);
    await settle();

    expect(seen).toEqual(['buffer', 'cache']);
  });

  it('follows disk writes into a closed note', async () => {
    const listener = vi.fn();
    source.watch(NOTE, listener);
    await settle();
    listener.mockClear();

    await harness.app.vault.process(new TFile(NOTE), (text: string) => text.replace('hp: 14', 'hp: 20'));
    await settle();

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ origin: 'cache', frontmatter: expect.objectContaining({ hp: 20 }) as unknown }));
  });

  it('stops telling a watcher that unsubscribed', async () => {
    const view = harness.open(NOTE);
    const listener = vi.fn();
    const stop = source.watch(NOTE, listener);
    await settle();
    listener.mockClear();
    stop();

    view.editor.type(NOTE_TEXT.replace('hp: 14', 'hp: 2'));
    await settle();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('viewing never writes', () => {
  it('reads and watches open, Reading, deferred and closed notes against a vault whose writes throw', async () => {
    const refuse = (): never => { throw new Error('Viewing must not write'); };
    for (const method of ['process', 'modify', 'create', 'append']) Object.assign(harness.app.vault, { [method]: vi.fn(refuse) });
    Object.assign(harness.app.vault.adapter, { write: vi.fn(refuse) });
    Object.assign(harness.app.fileManager, { processFrontMatter: vi.fn(refuse), renameFile: vi.fn(refuse), trashFile: vi.fn(refuse) });
    const other = 'Bestiary/Other.md';
    harness.files.set(other, '---\nhp: 3\n---\n');

    const stops = [NOTE, other, 'Bestiary/Nobody.md'].map((path) => source.watch(path, () => undefined));
    const editing = harness.open(NOTE);
    harness.open(NOTE, 'preview');
    harness.defer(other);
    source.read(NOTE);
    source.read(other);
    editing.editor.type(NOTE_TEXT.replace('hp: 14', 'hp: 5'));
    harness.close(editing);
    await settle();
    stops.forEach((stop) => stop());

    expect(harness.app.vault.process).not.toHaveBeenCalled();
    expect(harness.app.vault.adapter.write).not.toHaveBeenCalled();
    expect(harness.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    expect(editing.editor.transactions).toHaveLength(0);
    expect(harness.files.get(NOTE)).toBe(NOTE_TEXT);
  });
});
