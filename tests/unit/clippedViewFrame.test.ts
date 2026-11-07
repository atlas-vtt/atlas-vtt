// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { clippedViewFrame } from '../../src/app/packages/components/primitives/useKeepInView';

const rect = (left: number, top: number, right: number, bottom: number): DOMRect =>
  ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top, toJSON: () => ({}) }) as DOMRect;

function placed(element: HTMLElement, box: DOMRect): HTMLElement {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(box);
  return element;
}

describe('clippedViewFrame', () => {
  it('is the leaf cut by every ancestor in it that clips, and nothing outside the leaf', () => {
    const outside = placed(document.createElement('div'), rect(0, 0, 100, 100));
    outside.style.overflowY = 'hidden';
    const leaf = placed(document.createElement('div'), rect(0, 40, 1000, 900));
    leaf.className = 'workspace-leaf';
    const page = placed(document.createElement('div'), rect(0, 80, 1000, 880));
    page.style.overflowY = 'auto';
    const card = placed(document.createElement('div'), rect(600, 100, 900, 300));
    const trigger = document.createElement('button');
    outside.append(leaf);
    leaf.append(page);
    page.append(card);
    card.append(trigger);
    document.body.append(outside);

    // The card clips nothing, so a list hanging from the trigger may reach the page's edges.
    expect(clippedViewFrame(trigger)).toEqual({ left: 0, top: 80, right: 1000, bottom: 880 });
    card.style.overflowY = 'hidden';
    expect(clippedViewFrame(trigger)).toEqual({ left: 600, top: 100, right: 900, bottom: 300 });
    outside.remove();
  });
});
