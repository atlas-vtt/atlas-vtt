import { describe, expect, it } from 'vitest';
import { parseStatblockFence } from '../../src/app/statblocks/notes/statblockSource';

describe('parseStatblockFence', () => {
  it('finds a fence that names a bestiary creature', () => {
    const content = ['---', 'tags: [monster]', '---', '', '```statblock', 'creature: Giant Toad', '```'].join('\n');

    expect(parseStatblockFence(content)).toEqual({ creature: 'Giant Toad' });
  });

  it('finds a fence that defines the creature inline', () => {
    const content = ['```statblock', 'name: Goblin', 'ac: 15', 'hp: 7', '```'].join('\n');

    expect(parseStatblockFence(content)).toEqual({ name: 'Goblin', ac: 15, hp: 7 });
  });

  it('finds a fence that points at another note', () => {
    const content = ['```statblock', 'note: "[[Bestiary/Giant Toad]]"', '```'].join('\n');

    expect(parseStatblockFence(content)).toEqual({ note: '[[Bestiary/Giant Toad]]' });
  });

  it('supports tilde fences and extra backticks', () => {
    expect(parseStatblockFence(['~~~statblock', 'creature: Toad', '~~~'].join('\n'))).toEqual({
      creature: 'Toad',
    });
    expect(parseStatblockFence(['````statblock', 'creature: Toad', '````'].join('\n'))).toEqual({
      creature: 'Toad',
    });
  });

  it('returns null when the note has no statblock fence', () => {
    const content = ['# Notes', '', '```js', 'const x = 1;', '```'].join('\n');

    expect(parseStatblockFence(content)).toBeNull();
  });

  it('still reports a fence whose YAML is malformed', () => {
    const content = ['```statblock', 'creature: [unclosed', '```'].join('\n');

    expect(parseStatblockFence(content)).toEqual({});
  });
});
