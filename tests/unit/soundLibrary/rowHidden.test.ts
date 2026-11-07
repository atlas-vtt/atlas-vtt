// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { rowHidden } from '@/app/react/components/dm-screen/sound/library/rowHidden';

function row(name: string, tag: string | null, { cut = false, dropped = false } = {}): HTMLElement {
  const cell = document.createElement('span');
  const title = cell.appendChild(document.createElement('span'));
  title.className = 'atlas-sound-lib__title';
  title.textContent = name;
  Object.defineProperty(title, 'scrollWidth', { value: cut ? 400 : 100 });
  Object.defineProperty(title, 'clientWidth', { value: 100 });
  Object.defineProperty(title, 'offsetTop', { value: 10 });
  if (tag !== null) {
    const where = cell.appendChild(document.createElement('span'));
    where.className = 'atlas-sound-lib__where';
    where.textContent = tag;
    Object.defineProperty(where, 'offsetTop', { value: dropped ? 28 : 10 });
  }
  return title;
}

describe('what a library row hides', () => {
  it('is nothing while the name and its tag both show', () => {
    expect(rowHidden(row('Shieldwall', 'Battle'))).toBeNull();
  });

  it('is the name where its line cuts it', () => {
    expect(rowHidden(row('The Long Road Through the Whispering Pines', null, { cut: true }))).toBe('The Long Road Through the Whispering Pines');
  });

  it('names the tag that was dropped, even where the name fits', () => {
    expect(rowHidden(row('The Long Road', 'Exploration', { dropped: true }))).toBe('The Long Road · Exploration');
  });
});
