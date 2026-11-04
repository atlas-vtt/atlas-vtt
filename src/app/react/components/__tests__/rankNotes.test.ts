import { describe, expect, it, vi } from 'vitest';
import type { TFile } from 'obsidian';

vi.mock('obsidian', () => ({ moment: vi.fn(), getLanguage: () => 'en' }));

import { rankNotes } from '../LinkedNotePicker';

const note = (path: string, mtime: number, size = 100): TFile =>
  ({ path, basename: path.split('/').pop()!.replace(/\.md$/, ''), stat: { mtime, size } }) as TFile;

describe('rankNotes', () => {
  const files = [
    note('dragons/Old.md', 1),
    note('Dragon Lair.md', 2),
    note('.trash/Dragon.md', 9),
    note('Huge Dragon.md', 9, 2_000_000),
    note('Session Prep.md', 5),
  ];

  it('lists visible notes newest first without a query', () => {
    expect(rankNotes(files, '').map((f) => f.path)).toEqual(['Session Prep.md', 'Dragon Lair.md', 'dragons/Old.md']);
  });

  it('ranks title matches above path-only matches', () => {
    expect(rankNotes(files, 'dragon').map((f) => f.path)).toEqual(['Dragon Lair.md', 'dragons/Old.md']);
  });
});
