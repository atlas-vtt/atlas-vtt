// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { revealInList } from '../../src/app/utils/scrollWithin';

interface Shape {
  top: number;
  bottom: number;
  /** How the box scrolls down: its `overflow-y`, and how much taller its content is than itself. */
  scrolls?: { overflow: string; hidden: number };
}

/** An element with a place on the screen, which jsdom does not lay out. */
function box(parent: HTMLElement | null, { top, bottom, scrolls }: Shape): HTMLElement {
  const element = document.createElement('div');
  (parent ?? document.body).append(element);
  element.getBoundingClientRect = (): DOMRect => new DOMRect(0, top, 100, bottom - top);
  if (scrolls) {
    element.style.overflowY = scrolls.overflow;
    Object.defineProperty(element, 'clientHeight', { value: bottom - top });
    Object.defineProperty(element, 'scrollHeight', { value: bottom - top + scrolls.hidden });
  }
  return element;
}

describe('revealInList', () => {
  it('scrolls the list a row lies in until the row shows, and nothing around the list', () => {
    const pane = box(null, { top: 0, bottom: 400, scrolls: { overflow: 'auto', hidden: 600 } });
    const list = box(pane, { top: 0, bottom: 100, scrolls: { overflow: 'auto', hidden: 200 } });
    const row = box(list, { top: 150, bottom: 170 });

    revealInList(row);

    expect(list.scrollTop).toBe(70);
    expect(pane.scrollTop).toBe(0);
  });

  it('scrolls back to a row above the list', () => {
    const list = box(null, { top: 100, bottom: 200, scrolls: { overflow: 'scroll', hidden: 200 } });
    list.scrollTop = 80;
    const row = box(list, { top: 60, bottom: 80 });

    revealInList(row);

    expect(list.scrollTop).toBe(40);
  });

  it('passes a box that only clips, or holds all it has, for the one that scrolls', () => {
    const popover = box(null, { top: 0, bottom: 100, scrolls: { overflow: 'auto', hidden: 200 } });
    const clip = box(popover, { top: 0, bottom: 300, scrolls: { overflow: 'hidden', hidden: 50 } });
    const list = box(clip, { top: 0, bottom: 300, scrolls: { overflow: 'auto', hidden: 0 } });
    const row = box(list, { top: 150, bottom: 170 });

    revealInList(row);

    expect(popover.scrollTop).toBe(70);
    expect(clip.scrollTop).toBe(0);
    expect(list.scrollTop).toBe(0);
  });

  it('leaves a row that shows, and an element in no list, where they are', () => {
    const list = box(null, { top: 0, bottom: 100, scrolls: { overflow: 'auto', hidden: 200 } });
    list.scrollTop = 30;
    revealInList(box(list, { top: 40, bottom: 60 }));
    expect(list.scrollTop).toBe(30);

    expect(() => revealInList(box(null, { top: 500, bottom: 520 }))).not.toThrow();
  });
});
