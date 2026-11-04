import { describe, expect, it } from 'vitest';
import { foundExcerpt } from '../../../../src/app/online/tableLog/foundExcerpt.ts';

describe("a found note's card", () => {
  it('reads its first words as plain text, without headings, embeds or marks', () => {
    const note = '## Cellar\nBarrels of **old** wine, see [[Wine list|the list]] and [[Keep#Tower]].\n\n![[cask.png|200]]\n- A _dusty_ crate';
    expect(foundExcerpt(note)).toBe('Barrels of old wine, see the list and Tower. A dusty crate');
  });

  it('cuts a long text at a word, with an ellipsis', () => {
    const excerpt = foundExcerpt('word '.repeat(100), 30);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(31);
    expect(excerpt).not.toMatch(/wor…$/);
  });
});
