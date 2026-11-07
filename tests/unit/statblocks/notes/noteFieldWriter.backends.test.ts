// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COALESCE_MS, NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { NOTE, NOTE_TEXT, noteHarness, type NoteHarness } from './noteHarness';

const hp = (base: number, next: number): NotePatch => ({ op: 'set', path: ['hp'], base, next });

let harness: NoteHarness;
let writer: NoteFieldWriter;

beforeEach(() => {
  vi.useFakeTimers();
  harness = noteHarness({ [NOTE]: NOTE_TEXT });
  writer = NoteFieldWriter.forApp(harness.app);
});

afterEach(() => {
  NoteFieldWriter.release(harness.app);
  vi.useRealTimers();
});

describe('NoteFieldWriter backends, chosen per note when the write runs', () => {
  it('writes into a loaded editor at once, as the smallest change, and leaves the disk to Obsidian', async () => {
    const view = harness.open(NOTE);

    const outcome = writer.write(NOTE, [hp(14, 15)]);

    expect(view.editor.getValue()).toBe(NOTE_TEXT.replace('hp: 14', 'hp: 15'));
    expect(view.editor.transactions).toHaveLength(1);
    const [{ tx, origin }] = view.editor.transactions;
    expect(origin).toBe('atlas-statblock');
    expect(tx.changes).toEqual([{ from: { line: 2, ch: 5 }, to: { line: 2, ch: 6 }, text: '5' }]);
    expect(await outcome).toMatchObject({ backend: 'editor', applied: [hp(14, 15)], conflicts: [], problem: null });
    expect(harness.files.get(NOTE)).toBe(NOTE_TEXT);
    expect(harness.app.vault.process).not.toHaveBeenCalled();
  });

  it('prefers the editor of the view that shows the statblock when the note is open twice', async () => {
    const plain = harness.open(NOTE);
    const beside = harness.open(NOTE, 'source', true);

    await writer.write(NOTE, [hp(14, 15)]);

    expect(beside.editor.transactions).toHaveLength(1);
    expect(plain.editor.transactions).toHaveLength(0);
  });

  it('never writes through a Reading view, whose editor is a stale hidden buffer', async () => {
    const reading = harness.open(NOTE, 'preview');

    const outcome = writer.write(NOTE, [hp(14, 15)]);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    expect(await outcome).toMatchObject({ backend: 'vault', applied: [hp(14, 15)] });
    expect(reading.editor.transactions).toHaveLength(0);
    expect(harness.files.get(NOTE)).toContain('hp: 15');
    expect(reading.getViewData()).toContain('hp: 15');
  });

  it('writes to disk for a deferred leaf, which holds no editor yet', async () => {
    harness.defer(NOTE);

    const outcome = writer.write(NOTE, [hp(14, 15)]);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    expect((await outcome).backend).toBe('vault');
    expect(harness.files.get(NOTE)).toContain('hp: 15');
  });

  it('coalesces disk writes of a closed note for a moment, then writes them in one go', async () => {
    const first = writer.write(NOTE, [hp(14, 15)]);
    await vi.advanceTimersByTimeAsync(COALESCE_MS / 2);
    const second = writer.write(NOTE, [{ op: 'set', path: ['ac'], base: 12, next: 13 }]);
    expect(harness.app.vault.process).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(COALESCE_MS / 2);

    expect(harness.app.vault.process).toHaveBeenCalledTimes(1);
    expect((await first).backend).toBe('vault');
    expect((await second).applied).toHaveLength(1);
    expect(harness.files.get(NOTE)).toBe(NOTE_TEXT.replace('hp: 14', 'hp: 15').replace('ac: 12', 'ac: 13'));
  });

  it('takes the editor when the note opens before its pending disk write runs', async () => {
    const outcome = writer.write(NOTE, [hp(14, 15)]);
    const view = harness.open(NOTE);

    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    expect((await outcome).backend).toBe('editor');
    expect(view.editor.getValue()).toContain('hp: 15');
    expect(harness.app.vault.process).not.toHaveBeenCalled();
  });

  it('lands a batch in an editor with unsaved typing in the body and keeps the typing', async () => {
    const view = harness.open(NOTE);
    view.editor.type(`${NOTE_TEXT}Typed but not saved.\n`);

    await writer.patchNow(NOTE, (frontmatter) => [{ op: 'set', path: ['image'], base: frontmatter?.image, next: 'art/new.webp' }]);

    expect(view.editor.getValue()).toBe(`${NOTE_TEXT.replace('art/warden.webp', 'art/new.webp')}Typed but not saved.\n`);
    expect(harness.app.vault.process).not.toHaveBeenCalled();
  });

  it('writes nothing where the note no longer holds the base, and applies the rest of the batch', async () => {
    const view = harness.open(NOTE);

    const outcome = await writer.write(NOTE, [hp(20, 21), { op: 'set', path: ['ac'], base: 12, next: 13 }]);

    expect(outcome.conflicts).toEqual([hp(20, 21)]);
    expect(outcome.applied).toEqual([{ op: 'set', path: ['ac'], base: 12, next: 13 }]);
    expect(view.editor.getValue()).toContain('hp: 14');
    expect(view.editor.getValue()).toContain('ac: 13');
  });

  it('leaves a closed note untouched when every patch conflicts', async () => {
    const outcome = writer.write(NOTE, [hp(20, 21)]);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);

    expect((await outcome).conflicts).toEqual([hp(20, 21)]);
    expect(harness.app.vault.process).not.toHaveBeenCalled();
  });

  it('never writes a note whose YAML is broken, and says why', async () => {
    harness.files.set(NOTE, '---\nname: Warden\nhp: [14\n---\nBody\n');
    const view = harness.open(NOTE);

    const outcome = await writer.write(NOTE, [hp(14, 15)]);

    expect(outcome).toMatchObject({ applied: [], conflicts: [hp(14, 15)], backend: 'editor' });
    expect(outcome.problem).toMatch(/YAML error/);
    expect(view.editor.transactions).toHaveLength(0);
  });

  it('reports a note deleted before its write ran', async () => {
    const outcome = writer.write(NOTE, [hp(14, 15)]);
    harness.files.delete(NOTE);
    harness.vaultEvents.trigger('delete', { path: NOTE });

    expect(await outcome).toMatchObject({ backend: 'none', conflicts: [hp(14, 15)], problem: 'The note no longer exists.' });
  });

  it('follows a note renamed before its write ran', async () => {
    const outcome = writer.write(NOTE, [hp(14, 15)]);
    const renamed = 'Bestiary/Bog Warden.md';
    harness.files.set(renamed, harness.files.get(NOTE)!);
    harness.files.delete(NOTE);
    harness.vaultEvents.trigger('rename', { path: renamed }, NOTE);

    expect((await outcome).backend).toBe('vault');
    expect(harness.files.get(renamed)).toContain('hp: 15');
  });
});

describe('NoteFieldWriter flushing, undo and echoes', () => {
  it('flushes a path at once and saves the editors written to', async () => {
    const view = harness.open(NOTE);
    void writer.write(NOTE, [hp(14, 15)]);
    expect(harness.files.get(NOTE)).toBe(NOTE_TEXT);

    await writer.flush(NOTE);

    expect(view.save).toHaveBeenCalledTimes(1);
    expect(harness.files.get(NOTE)).toContain('hp: 15');
  });

  it('flushAll writes pending disk writes without waiting out the window', async () => {
    const outcome = writer.write(NOTE, [hp(14, 15)]);

    await writer.flushAll();

    expect((await outcome).backend).toBe('vault');
    expect(harness.files.get(NOTE)).toContain('hp: 15');
  });

  it('starts the last flush when it is released', async () => {
    const outcome = writer.write(NOTE, [hp(14, 15)]);

    NoteFieldWriter.release(harness.app);

    expect((await outcome).backend).toBe('vault');
    expect(harness.files.get(NOTE)).toContain('hp: 15');
    expect(harness.vaultEvents.count('rename')).toBe(0);
  });

  it('undoes and redoes in the editor that holds the note, and only there', async () => {
    expect(writer.undo(NOTE)).toBe(false);
    const view = harness.open(NOTE);
    await writer.write(NOTE, [hp(14, 15)]);

    expect(writer.undo(NOTE)).toBe(true);
    expect(view.editor.getValue()).toContain('hp: 14');
    expect(writer.redo(NOTE)).toBe(true);
    expect(view.editor.getValue()).toContain('hp: 15');
  });

  it('knows its own writes when they come back, for a while', async () => {
    const view = harness.open(NOTE);
    const seen: boolean[] = [];
    harness.workspace.on('editor-change', () => { seen.push(writer.isOwnEcho(NOTE, view.editor.getValue())); });

    await writer.write(NOTE, [hp(14, 15)]);

    expect(seen).toEqual([true]);
    expect(writer.isOwnEcho(NOTE, 'name: Marsh Warden\nhp: 15\nac: 12\nimage: art/warden.webp\n')).toBe(true);
    expect(writer.isOwnEcho(NOTE, NOTE_TEXT)).toBe(false);
    view.editor.type(view.editor.getValue().replace('hp: 15', 'hp: 16'));
    expect(writer.isOwnEcho(NOTE, view.editor.getValue())).toBe(false);
    vi.advanceTimersByTime(6000);
    expect(writer.isOwnEcho(NOTE, view.editor.getValue().replace('hp: 16', 'hp: 15'))).toBe(false);
  });

  it('knows the echo of a disk write too', async () => {
    const outcome = writer.write(NOTE, [hp(14, 15)]);
    await vi.advanceTimersByTimeAsync(COALESCE_MS);
    await outcome;

    expect(writer.isOwnEcho(NOTE, harness.files.get(NOTE)!)).toBe(true);
  });
});
