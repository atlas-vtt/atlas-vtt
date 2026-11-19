// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { registerNoteWriterFlush } from '../../../../src/app/plugin/noteWriterFlush';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { QUIT_WAIT_MS } from '../../../../src/app/utils/quitTasks';
import { follow, QuitTasks, restOfTheTask } from '../../../helpers/obsidianQuit';
import { NOTE, NOTE_TEXT, noteHarness, type NoteHarness } from './noteHarness';

interface PluginStub {
  plugin: Plugin;
  unload: () => void;
}

/** The parts of `Plugin` the wiring uses: events and cleanups, released on unload. */
function pluginStub(harness: NoteHarness): PluginStub {
  const cleanups: Array<() => void> = [];
  const plugin = {
    app: harness.app,
    registerEvent: (ref: unknown) => { cleanups.push(() => harness.workspace.offref(ref)); },
    register: (cleanup: () => void) => { cleanups.push(cleanup); },
  };
  return { plugin: plugin as unknown as Plugin, unload: () => { cleanups.splice(0).forEach((cleanup) => cleanup()); } };
}

let harness: NoteHarness;
let stub: PluginStub;

beforeEach(() => {
  vi.useFakeTimers();
  harness = noteHarness({ [NOTE]: NOTE_TEXT });
  stub = pluginStub(harness);
  registerNoteWriterFlush(stub.plugin);
});

afterEach(() => {
  stub.unload();
  vi.useRealTimers();
});

const SET_HP = [{ op: 'set', path: ['hp'], base: 14, next: 15 }] as const;
const pendingWrite = (): Promise<unknown> => NoteFieldWriter.forApp(harness.app).write(NOTE, SET_HP);

/** Obsidian asks what to wait for before it quits. */
function quit(): QuitTasks {
  const tasks = new QuitTasks();
  harness.workspace.trigger('quit', tasks);
  return tasks;
}

describe('flushing statblock edits on the way out', () => {
  it('has Obsidian wait for the flush before it quits', async () => {
    void pendingWrite();

    const tasks = quit();

    expect(tasks.isEmpty()).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await tasks.promise();
    expect(harness.files.get(NOTE)).toContain('hp: 15');
  });

  it('commits the text of an input still being typed in before the quit flush, which neither blurs nor closes it', async () => {
    const writer = NoteFieldWriter.forApp(harness.app);
    const typed = vi.fn(async (): Promise<void> => { await pendingWrite(); });
    const gone = vi.fn(async (): Promise<void> => undefined);
    writer.registerPending(typed);
    writer.registerPending(gone)();

    const tasks = quit();
    await vi.advanceTimersByTimeAsync(0);
    await tasks.promise();

    expect(harness.files.get(NOTE)).toContain('hp: 15');
    expect(typed).toHaveBeenCalledTimes(1);
    expect(gone).not.toHaveBeenCalled();
  });

  // A task of any kind makes Obsidian call the quit off and close the window itself, after which
  // Obsidian up to 1.14 stays running on macOS: a quit with nothing to save must add none (#618).
  it('adds no quit task while nothing is to be written or saved', () => {
    expect(quit().isEmpty()).toBe(true);
  });

  it('adds none for a value that has focus and was not changed', () => {
    const untouched = vi.fn(async (): Promise<void> => undefined);
    NoteFieldWriter.forApp(harness.app).registerPending(untouched);

    expect(quit().isEmpty()).toBe(true);
    expect(untouched).toHaveBeenCalledTimes(1);
  });

  it('adds none for an editor that was saved since Atlas wrote into it, and one while it was not', async () => {
    const view = harness.open(NOTE);
    await pendingWrite();
    expect(view.editor.getValue()).toContain('hp: 15');

    const unsaved = quit();
    expect(unsaved.isEmpty()).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    await unsaved.promise();
    expect(harness.files.get(NOTE)).toContain('hp: 15');

    await NoteFieldWriter.forApp(harness.app).write(NOTE, [{ op: 'set', path: ['hp'], base: 15, next: 16 }]);
    // Obsidian's own save, two seconds after the change
    await view.save();
    expect(quit().isEmpty()).toBe(true);
  });

  it('is done with a task only after the quit event, when Obsidian\'s close of the window counts', async () => {
    const view = harness.open(NOTE);
    await pendingWrite();

    const waited = follow(quit().promise());
    await restOfTheTask();

    expect(view.save).toHaveBeenCalled();
    expect(waited.outcome()).toBe('pending');
    await vi.advanceTimersByTimeAsync(0);
    expect(waited.outcome()).toBe('done');
  });

  it('never keeps Obsidian from quitting: a write that hangs is waited for a moment only', async () => {
    harness.app.vault.read = vi.fn(() => new Promise<string>(() => undefined));
    void pendingWrite();

    const waited = follow(quit().promise());
    await vi.advanceTimersByTimeAsync(QUIT_WAIT_MS - 1);
    expect(waited.outcome()).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(waited.outcome()).toBe('done');
  });

  it('never keeps Obsidian from quitting: a save that fails ends the wait', async () => {
    const view = harness.open(NOTE);
    await pendingWrite();
    view.save.mockRejectedValueOnce(new Error('disk full'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const waited = follow(quit().promise());
    await vi.advanceTimersByTimeAsync(0);

    expect(waited.outcome()).toBe('done');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('flushes when a window closes, and saves the editors written to', async () => {
    const view = harness.open(NOTE);
    void pendingWrite();

    harness.workspace.trigger('window-close', {}, window);
    await vi.waitFor(() => { expect(view.save).toHaveBeenCalled(); });

    expect(harness.files.get(NOTE)).toContain('hp: 15');
  });

  it('writes what is pending when the plugin unloads, and stops listening', async () => {
    const write = pendingWrite();

    stub.unload();

    expect(await write).toMatchObject({ backend: 'vault' });
    expect(harness.files.get(NOTE)).toContain('hp: 15');
    expect(harness.workspace.count('quit')).toBe(0);
    expect(harness.workspace.count('window-close')).toBe(0);
  });
});
