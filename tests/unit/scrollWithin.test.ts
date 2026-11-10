// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { scrollWithin } from '../../src/app/utils/scrollWithin';

/** A list 100 px high whose top is at y = 200, scrolled by `scrollTop`, and an element at `top` of its content. */
function list(scrollTop: number, top: number, height: number): { container: HTMLElement; element: Element } {
  const container = { scrollTop, getBoundingClientRect: () => ({ top: 200, bottom: 300 }) } as unknown as HTMLElement;
  const element = { getBoundingClientRect: () => ({ top: 200 + top - scrollTop, bottom: 200 + top - scrollTop + height }) } as unknown as Element;
  return { container, element };
}

function scrolled(scrollTop: number, top: number, height: number, block: 'start' | 'nearest'): number {
  const { container, element } = list(scrollTop, top, height);
  scrollWithin(container, element, block);
  return container.scrollTop;
}

describe('scrollWithin', () => {
  it('leaves the list alone while the element shows whole', () => {
    expect(scrolled(50, 60, 40, 'nearest')).toBe(50);
  });

  it('scrolls no farther than it takes to show an element below or above', () => {
    expect(scrolled(0, 150, 40, 'nearest')).toBe(90);
    expect(scrolled(200, 150, 40, 'nearest')).toBe(150);
  });

  it('shows the top of an element taller than the list', () => {
    expect(scrolled(0, 150, 300, 'nearest')).toBe(150);
  });

  it('puts the element at the top of the list where asked', () => {
    expect(scrolled(0, 60, 40, 'start')).toBe(60);
    expect(scrolled(200, 60, 40, 'start')).toBe(60);
  });

  function cards(scrollTop: number, positions: Array<[number, number]>): { container: HTMLElement; elements: HTMLElement[] } {
    const container = document.createElement('div');
    container.scrollTop = scrollTop;
    container.getBoundingClientRect = () => new DOMRect(0, 200, 100, 100);
    const elements = positions.map(([top, height]) => {
      const element = document.createElement('div');
      element.getBoundingClientRect = () => new DOMRect(0, 200 + top - container.scrollTop, 100, height);
      container.append(element);
      return element;
    });
    return { container, elements };
  }

  it('shows the active card and the next two with the smallest scroll needed', () => {
    const { container, elements } = cards(0, [[0, 20], [30, 20], [60, 20], [90, 20], [120, 20], [150, 20]]);
    scrollWithin(container, elements[2]!, 'nearest', 2);
    expect(container.scrollTop).toBe(40);
  });

  it('does not move a range that already fits', () => {
    const { container, elements } = cards(40, [[60, 20], [90, 20], [120, 20], [150, 20]]);
    scrollWithin(container, elements[0]!, 'nearest', 2);
    expect(container.scrollTop).toBe(40);
  });

  it('prioritises the active card when its following cards are too tall to fit', () => {
    const { container, elements } = cards(0, [[60, 35], [105, 50], [165, 45]]);
    scrollWithin(container, elements[0]!, 'nearest', 2);
    expect(container.scrollTop).toBe(60);
  });

  it('brings the active card back from above the viewport without hiding it for its successors', () => {
    const { container, elements } = cards(120, [[30, 20], [60, 20], [90, 20]]);
    scrollWithin(container, elements[0]!, 'nearest', 2);
    expect(container.scrollTop).toBe(30);
  });

  it.each([1, 2])('handles only %i cards remaining at the end of the list', (count) => {
    const { container, elements } = cards(0, [[90, 20], [120, 20]].slice(0, count) as Array<[number, number]>);
    scrollWithin(container, elements[0]!, 'nearest', 2);
    expect(container.scrollTop).toBe(count === 1 ? 10 : 40);
  });

  it('does not scroll the surrounding view', () => {
    const outer = document.createElement('div');
    outer.scrollTop = 75;
    const { container, elements } = cards(0, [[60, 20], [90, 20], [120, 20]]);
    outer.append(container);
    scrollWithin(container, elements[0]!, 'nearest', 2);
    expect(container.scrollTop).toBe(40);
    expect(outer.scrollTop).toBe(75);
  });
});
