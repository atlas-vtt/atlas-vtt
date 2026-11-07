// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTE_YAML_LIMITS } from '../../../../src/app/services/noteYaml';
import { applyWrites } from '../../../../src/app/statblocks/notes/applyWrites';
import { smallestChange } from '../../../../src/app/statblocks/notes/editorWrite';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import { frontmatterProblem } from '../../../../src/app/statblocks/notes/frontmatterProblem';
import { WriteQueue } from '../../../../src/app/statblocks/notes/writeQueue';

describe('frontmatterProblem', () => {
  it('finds nothing wrong with a sound note, or one without properties', () => {
    expect(frontmatterProblem('---\nhp: 3\n---\nBody')).toBeNull();
    expect(frontmatterProblem('Just prose.')).toBeNull();
    expect(frontmatterProblem('---\n---\n')).toBeNull();
  });

  it('names the note line of a YAML error', () => {
    expect(frontmatterProblem('---\nname: Warden\nhp: [14\n---\n')).toEqual({ line: 3, message: 'The note\'s properties have a YAML error on line 3.' });
    expect(frontmatterProblem('---\nname: Warden\nname: Other\n---\n')?.message).toMatch(/YAML error/);
  });

  it('refuses properties not written one key per line, and a closing line Obsidian reads two ways', () => {
    expect(frontmatterProblem('---\n{hp: 3}\n---\n')?.message).toBe('The note\'s properties are not written as one key per line.');
    expect(frontmatterProblem('---\nhp: 3\n--- \nBody')).toMatchObject({ line: 3 });
  });

  it('refuses properties beyond what Atlas reads as YAML, and the patcher leaves such a note alone', () => {
    const long = `---\nhp: 3\ndesc: ${'a'.repeat(NOTE_YAML_LIMITS.characters)}\n---\nBody`;
    const aliases = Array.from({ length: NOTE_YAML_LIMITS.aliases + 1 }, (_, index) => `b${index}: *a`).join('\n');
    const repeating = `---\nhp: 3\na: &a [x, x, x]\n${aliases}\n---\nBody`;
    for (const text of [long, repeating]) {
      expect(frontmatterProblem(text)).toEqual({
        line: 2,
        message: 'The note\'s properties are too long, or repeat too much through YAML aliases, for Atlas to read.',
      });
      const result = applyFrontmatterPatches(text, [{ op: 'set', path: ['hp'], base: 3, next: 4 }]);
      expect(result.text).toBe(text);
      expect(result.applied).toEqual([]);
    }
  });
});

describe('smallestChange', () => {
  it('replaces only what differs, so a caret elsewhere stays', () => {
    expect(smallestChange('hp: 14\nac: 12', 'hp: 15\nac: 12')).toEqual({ from: 5, to: 6, insert: '5' });
    expect(smallestChange('same', 'same')).toBeNull();
    expect(smallestChange('ab', 'aXb')).toEqual({ from: 1, to: 1, insert: 'X' });
  });

  it('never splits a surrogate pair', () => {
    const change = smallestChange('a😀b', 'a😁b')!;
    expect(change).toEqual({ from: 1, to: 3, insert: '😁' });
  });
});

describe('applyWrites', () => {
  it('applies requests in order and builds patches from the text each one lands in', () => {
    const { text, results } = applyWrites('---\nhp: 3\n---\n', [
      { patches: [{ op: 'set', path: ['hp'], base: 3, next: 4 }] },
      { build: (frontmatter) => [{ op: 'set', path: ['hp'], base: frontmatter?.hp, next: 5 }] },
    ]);
    expect(text).toBe('---\nhp: 5\n---\n');
    expect(results.map((result) => result.applied.length)).toEqual([1, 1]);
  });

  it('writes nothing into broken YAML and reports it', () => {
    const patches = [{ op: 'set' as const, path: ['hp'], base: 3, next: 4 }];
    const { text, results } = applyWrites('---\nhp: [3\n---\n', [{ patches }]);
    expect(text).toBe('---\nhp: [3\n---\n');
    expect(results[0]).toMatchObject({ applied: [], conflicts: patches, problem: expect.stringMatching(/YAML error/) as string });
  });
});

describe('WriteQueue', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('runs a path\'s items together once its window ends, and the window does not move', async () => {
    vi.useFakeTimers();
    const runs: string[][] = [];
    const queue = new WriteQueue<string>((_path, items) => { runs.push(items); });
    queue.add('a.md', 'one');
    queue.schedule('a.md', 300);
    await vi.advanceTimersByTimeAsync(200);
    queue.add('a.md', 'two');
    queue.schedule('a.md', 300);
    await vi.advanceTimersByTimeAsync(100);
    expect(runs).toEqual([['one', 'two']]);
  });

  it('starts a run only after the run in flight for the same path', async () => {
    const order: string[] = [];
    let finish: () => void = () => undefined;
    const queue = new WriteQueue<string>((_path, items) => {
      order.push(`start ${items.join()}`);
      if (items[0] === 'slow') return new Promise<void>((resolve) => { finish = () => { order.push('end slow'); resolve(); }; });
      return undefined;
    });
    queue.add('a.md', 'slow');
    const slow = queue.flush('a.md');
    queue.add('a.md', 'next');
    const next = queue.flush('a.md');
    expect(order).toEqual(['start slow']);
    finish();
    await Promise.all([slow, next]);
    expect(order).toEqual(['start slow', 'end slow', 'start next']);
  });

  it('moves waiting items with a renamed note', async () => {
    const runs: Array<[string, string[]]> = [];
    const queue = new WriteQueue<string>((path, items) => { runs.push([path, items]); });
    queue.add('a.md', 'one');
    queue.move('a.md', 'b.md');
    await queue.flushAll();
    expect(runs).toEqual([['b.md', ['one']]]);
  });
});
