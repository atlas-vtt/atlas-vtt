// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { templateBodyPath } from '../../../../src/app/statblocks/library/templatePaths';
import { switchTemplates } from '../../../../src/app/statblocks/notes/templateSwitch';
import { MARSH_PATH, marshText } from '../library/templateTexts';
import { noteHarness, type NoteHarness } from './noteHarness';

const note = (template: string, body = ''): string => `---\nstatblock: true\natlas-template: ${template}\nhp: 3\n---\n${body}`;
const OLD = 'marsh-creature';
const NEW = 'bog-creature';

let harness: NoteHarness;
afterEach(() => { NoteFieldWriter.release(harness.app); });

describe('switchTemplates', () => {
  it('switches every listed note at once, through an open editor where there is one, and reports progress', async () => {
    harness = noteHarness({ 'a.md': note(OLD), 'b.md': note(OLD), 'c.md': note(OLD) });
    const open = harness.open('b.md');
    open.editor.type(note(OLD, 'Typed.\n'));
    const progress = vi.fn();

    const result = await switchTemplates(harness.app, ['a.md', 'b.md', 'c.md'].map((path) => ({ path, from: OLD })), NEW, { onProgress: progress });

    expect(result).toEqual({ switched: ['a.md', 'b.md', 'c.md'], skipped: [], notReached: [] });
    expect(harness.files.get('a.md')).toBe(note(NEW));
    expect(open.editor.getValue()).toBe(note(NEW, 'Typed.\n'));
    expect(progress.mock.calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('changes only the template a note names, never its body, whatever text the new template gives new notes', async () => {
    harness = noteHarness({
      'a.md': note(OLD, '## Mine\n\nWritten by hand.\n'),
      [MARSH_PATH]: marshText({ id: 'bog-creature-abc123' }),
      [templateBodyPath(MARSH_PATH)]: '## Lair\n',
    });

    await switchTemplates(harness.app, [{ path: 'a.md', from: OLD }], 'bog-creature-abc123');

    expect(harness.files.get('a.md')).toBe(note('bog-creature-abc123', '## Mine\n\nWritten by hand.\n'));
  });

  it('keeps a note whose template changed since it was listed, and one it cannot read', async () => {
    harness = noteHarness({ 'a.md': note('other'), 'b.md': '---\natlas-template: [x\n---\n' });

    const result = await switchTemplates(harness.app, [{ path: 'a.md', from: OLD }, { path: 'b.md', from: OLD }], NEW);

    expect(result.switched).toEqual([]);
    expect(result.skipped).toEqual([
      { path: 'a.md', reason: 'Its template was changed meanwhile.' },
      { path: 'b.md', reason: expect.stringMatching(/YAML error/) as string },
    ]);
    expect(harness.files.get('a.md')).toBe(note('other'));
  });

  it('stops at Cancel and leaves the notes not reached as they were', async () => {
    harness = noteHarness({ 'a.md': note(OLD), 'b.md': note(OLD) });
    const cancel = new AbortController();

    const result = await switchTemplates(harness.app, [{ path: 'a.md', from: OLD }, { path: 'b.md', from: OLD }], NEW, {
      signal: cancel.signal,
      onProgress: () => cancel.abort(),
    });

    expect(result).toEqual({ switched: ['a.md'], skipped: [], notReached: ['b.md'] });
    expect(harness.files.get('b.md')).toBe(note(OLD));
  });

  it('can run twice: a switched note stays switched', async () => {
    harness = noteHarness({ 'a.md': note(OLD) });
    await switchTemplates(harness.app, [{ path: 'a.md', from: OLD }], NEW);

    const again = await switchTemplates(harness.app, [{ path: 'a.md', from: OLD }], NEW);

    expect(again.switched).toEqual(['a.md']);
    expect(harness.files.get('a.md')).toBe(note(NEW));
  });
});
