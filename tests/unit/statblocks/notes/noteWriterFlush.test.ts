// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { registerNoteWriterFlush } from '../../../../src/app/plugin/noteWriterFlush';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
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

const pendingWrite = (): Promise<unknown> => NoteFieldWriter.forApp(harness.app).write(NOTE, [{ op: 'set', path: ['hp'], base: 14, next: 15 }]);

describe('flushing statblock edits on the way out', () => {
  it('adds the flush to the quit tasks, which Obsidian awaits', async () => {
    void pendingWrite();
    const tasks: Array<() => Promise<unknown>> = [];

    harness.workspace.trigger('quit', { add: (task: () => Promise<unknown>) => tasks.push(task), addPromise: vi.fn() });

    expect(tasks).toHaveLength(1);
    expect(harness.files.get(NOTE)).toBe(NOTE_TEXT);
    await tasks[0]!();
    expect(harness.files.get(NOTE)).toContain('hp: 15');
  });

  it('commits the text of an input still being typed in before the quit flush, which neither blurs nor closes it', async () => {
    const writer = NoteFieldWriter.forApp(harness.app);
    const typed = vi.fn(async (): Promise<void> => { await pendingWrite(); });
    const gone = vi.fn(async (): Promise<void> => undefined);
    writer.registerPending(typed);
    writer.registerPending(gone)();
    const tasks: Array<() => Promise<unknown>> = [];

    harness.workspace.trigger('quit', { add: (task: () => Promise<unknown>) => tasks.push(task), addPromise: vi.fn() });
    await tasks[0]!();

    expect(harness.files.get(NOTE)).toContain('hp: 15');
    expect(typed).toHaveBeenCalledTimes(1);
    expect(gone).not.toHaveBeenCalled();
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
