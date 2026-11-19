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

describe("a found note's card with a table", () => {
  it('reads the table as the words of its cells, without pipes or the delimiter row', () => {
    const note = 'Order of battle:\n\n| Init | Name |\n| ---: | :--- |\n| 18 | **Mirela** |\n| 9 | Goblin \\| archer, [[Old Hale\\|Hale]] |\n\nThen | stays.';
    expect(foundExcerpt(note)).toBe('Order of battle: Init Name 18 Mirela 9 Goblin | archer, Hale Then | stays.');
  });

  it('reads a table without outer pipes too', () => {
    expect(foundExcerpt('a | b\n--|--\n1 | [[Mill|the mill]]')).toBe('a b 1 the mill');
  });
});
