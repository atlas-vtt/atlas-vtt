import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { measureBar } from '../../src/app/packages/components/toolbar/toolbarGeometry';

let offsetWidth: PropertyDescriptor | undefined;
const widths = new Map<string, number>();

beforeEach(() => {
  offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) { return widths.get(this.dataset.toolbarItem ?? '') ?? 0; },
  });
});

afterEach(() => {
  if (offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth);
  widths.clear();
  document.body.empty();
});

function bar(ids: string[]): HTMLElement {
  const element = document.body.createDiv({ cls: 'atlas-vtt-toolbar' });
  for (const id of ids) element.createDiv({ attr: { 'data-toolbar-item': id } });
  return element;
}

describe('measureBar', () => {
  it('keeps the last width of an item in the middle of a transition', () => {
    const element = bar(['fog', 'draw']);
    widths.set('fog', 40).set('draw', 60);
    const first = measureBar(element, null);
    expect(first.widths).toEqual({ fog: 40, draw: 60 });

    widths.set('fog', 12);
    element.querySelector<HTMLElement>('[data-toolbar-item="fog"]')!.dataset.animating = '';
    expect(measureBar(element, first).widths).toEqual({ fog: 40, draw: 60 });
  });

  it('keeps the last width of a hidden item and has none for one never shown', () => {
    const element = bar(['fog', 'draw']);
    widths.set('fog', 40).set('draw', 60);
    element.querySelector<HTMLElement>('[data-toolbar-item="draw"]')!.hidden = true;
    const first = measureBar(element, null);
    expect(first.widths).toEqual({ fog: 40 });

    element.querySelector<HTMLElement>('[data-toolbar-item="fog"]')!.hidden = true;
    expect(measureBar(element, first).widths).toEqual({ fog: 40 });
  });
});
