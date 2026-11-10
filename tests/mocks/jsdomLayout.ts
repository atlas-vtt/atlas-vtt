import { afterAll, beforeAll } from 'vitest';

export interface Viewport {
  width: number;
  height: number;
}

/**
 * jsdom has no layout: gives every element the viewport's box for the tests of
 * this file, so virtual lists have room to show their first rows and each row
 * measures as tall as the viewport.
 */
export function stubLayout(viewport: Viewport): void {
  const rect = (): DOMRect => ({
    ...viewport, top: 0, left: 0, right: viewport.width, bottom: viewport.height, x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
  const stubs: Array<[object, string, PropertyDescriptor]> = [
    [Element.prototype, 'getBoundingClientRect', { configurable: true, value: rect }],
    [Element.prototype, 'clientWidth', { configurable: true, get: () => viewport.width }],
    [Element.prototype, 'clientHeight', { configurable: true, get: () => viewport.height }],
    [HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => viewport.width }],
    [HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => viewport.height }],
  ];
  const originals = stubs.map(([target, name]) => [target, name, Object.getOwnPropertyDescriptor(target, name)] as const);
  beforeAll(() => {
    for (const [target, name, descriptor] of stubs) Object.defineProperty(target, name, descriptor);
  });
  afterAll(() => {
    for (const [target, name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(target, name, descriptor);
      else Reflect.deleteProperty(target, name);
    }
  });
}
