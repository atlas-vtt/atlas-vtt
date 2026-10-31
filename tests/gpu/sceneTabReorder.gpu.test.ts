import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import {
  frames, mountSceneTabs, ownerEscape, pickUp, pointIn, pointer, wheel,
  type Point, type SceneTabsHarness,
} from './sceneTabReorderHarness';

describe('scene-tab reordering in Chromium', () => {
  let h: SceneTabsHarness | undefined;
  let previousActEnvironment: unknown;

  beforeEach(async () => {
    await page.viewport(1280, 800);
    previousActEnvironment = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
  });

  afterEach(async () => {
    // Release a real button even if an assertion failed during a held drag.
    if (h) {
      ownerEscape(h);
      await h.mouse.up({ x: 1, y: 1 });
      h.dispose();
      h = undefined;
    }
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment);
    await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  });

  const mount = async (options: Parameters<typeof mountSceneTabs>[0] = {}): Promise<SceneTabsHarness> => {
    h = await mountSceneTabs(options);
    return h;
  };
  const grabbing = (fixture: SceneTabsHarness): boolean => fixture.doc.body.classList.contains('atlas-toolbar-grabbing');
  const expectNoMapInput = (fixture: SceneTabsHarness): void => {
    expect(fixture.calls.mapMove).not.toHaveBeenCalled();
    expect(fixture.calls.mapUp).not.toHaveBeenCalled();
    expect(fixture.calls.mapClick).not.toHaveBeenCalled();
    expect(fixture.calls.mapEscape).not.toHaveBeenCalled();
  };
  const expectNoTabActions = (fixture: SceneTabsHarness): void => {
    expect(fixture.calls.switch).not.toHaveBeenCalled();
    expect(fixture.calls.present).not.toHaveBeenCalled();
    expect(fixture.calls.close).not.toHaveBeenCalled();
    expect(fixture.calls.add).not.toHaveBeenCalled();
    expect(fixture.calls.all).not.toHaveBeenCalled();
  };
  const rightEnd = (fixture: SceneTabsHarness): Point => {
    const box = fixture.strip.getBoundingClientRect();
    return { x: box.right - 2, y: box.top + box.height / 2 };
  };
  const before = (fixture: SceneTabsHarness, id: string): Point => pointIn(fixture.tab(id), 0.1);
  const expectClean = (fixture: SceneTabsHarness): void => {
    expect(grabbing(fixture)).toBe(false);
    expect(fixture.win.getComputedStyle(fixture.name(fixture.order()[0]!)).cursor).not.toBe('grabbing');
  };

  for (const motion of ['no-preference', 'reduce'] as const) {
    it(`moves inactive first/last tabs across the whole strip with real mouse input (${motion})`, async () => {
      await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: motion }] });
      const fixture = await mount();
      const [a, b, c, d] = fixture.ids as [string, string, string, string];
      act(() => fixture.store.getState().setActiveTab(b));
      await frames();
      const objects = [...fixture.store.getState().tabs];
      const boxes = objects.map((tab) => fixture.tab(tab.id).getBoundingClientRect().width);
      const shown = fixture.presented();
      const end = rightEnd(fixture);
      await pickUp(fixture, a, end);
      expect(grabbing(fixture)).toBe(true);
      expect(fixture.win.getComputedStyle(fixture.name(a)).cursor).toBe('grabbing');
      expect(fixture.order()).toEqual([a, b, c, d]);
      expect(fixture.domOrder()).toEqual([a, b, c, d]);
      expect(fixture.calls.move).not.toHaveBeenCalled();
      expect(objects.map((tab) => fixture.tab(tab.id).getBoundingClientRect().width)).toEqual(boxes);
      expect(fixture.doc.querySelector('[role="tooltip"]')).toBeNull();
      expect(fixture.win.getSelection()?.toString()).toBe('');
      expectNoTabActions(fixture);
      await page.screenshot({ path: `__screenshots__/scene-tab-reorder-wide-${motion}.png`, element: fixture.host });
      await fixture.mouse.up(end);
      await frames();
      expect(fixture.order()).toEqual([b, c, d, a]);
      expect(fixture.domOrder()).toEqual(fixture.order());
      expect(fixture.calls.move).toHaveBeenCalledExactlyOnceWith(a, null);
      expect(fixture.doc.activeElement).toBe(fixture.tab(a));
      expect(fixture.store.getState().activeTabId).toBe(b);
      expect(fixture.presented()).toBe(shown);
      expect(fixture.action(shown!, 'eye').getAttribute('aria-pressed')).toBe('true');
      for (const original of objects) expect(fixture.store.getState().tabs.find((tab) => tab.id === original.id)).toBe(original);
      expect(fixture.live()).toContain('moved to position 4 of 4');
      expect(fixture.live()).not.toContain('canceled');
      expectClean(fixture);

      fixture.clearCalls();
      const start = before(fixture, b);
      await pickUp(fixture, a, start);
      await fixture.mouse.up(start);
      await frames();
      expect(fixture.order()).toEqual([a, b, c, d]);
      expect(fixture.calls.move).toHaveBeenCalledExactlyOnceWith(a, b);
      expect(fixture.store.getState().activeTabId).toBe(b);
      expect(fixture.presented()).toBe(shown);
      expectNoTabActions(fixture);
      expectNoMapInput(fixture);
      expectClean(fixture);
    });
  }

  it('keeps processing tooltips closed during a drag and available again afterwards', async () => {
    const fixture = await mount({ processing: true });
    const source = fixture.ids[0]!;
    const ring = fixture.query('.atlas-scene-tab__processing');
    await fixture.mouse.hover(pointIn(ring));
    await expect.poll(() => fixture.doc.querySelector('[role="tooltip"]')?.textContent).toContain('25%');

    // Start from the processing sign itself, including its tooltip's closing animation.
    const from = pointIn(ring);
    pointer(fixture, 'pointerdown', from);
    pointer(fixture, 'pointermove', { x: from.x + 5, y: from.y });
    await frames();
    expect(grabbing(fixture)).toBe(true);
    await expect.poll(() => fixture.doc.querySelector('[role="tooltip"]')).toBeNull();
    act(() => fixture.processing!.progress(50));
    await frames();
    expect(grabbing(fixture)).toBe(true);
    expect(fixture.doc.querySelector('[role="tooltip"]')).toBeNull();
    expect(fixture.tab(source).querySelector('.atlas-processing-ring__fill')?.getAttribute('stroke-dashoffset')).toBe('50');

    ownerEscape(fixture);
    pointer(fixture, 'pointerup', from);
    await frames();
    await fixture.mouse.hover({ x: 1, y: 1 });
    await fixture.mouse.hover(pointIn(ring));
    await expect.poll(() => fixture.doc.querySelector('[role="tooltip"]')?.textContent).toContain('50%');
    expect(fixture.order()).toEqual(fixture.ids);
    expectClean(fixture);
  });

  it('cancels a drag when processing finishes and changes tab width, then accepts another drag', async () => {
    const fixture = await mount({ processing: true });
    const [a, b, c, d] = fixture.ids as [string, string, string, string];
    const width = fixture.tab(a).getBoundingClientRect().width;
    await pickUp(fixture, a, pointIn(fixture.name(c)));
    expect(grabbing(fixture)).toBe(true);
    act(() => fixture.processing!.complete());
    await frames();
    expect(fixture.tab(a).getBoundingClientRect().width).toBeLessThan(width);
    expect(fixture.tab(a).querySelector('.atlas-scene-tab__processing')).toBeNull();
    expect(grabbing(fixture)).toBe(false);
    await fixture.mouse.up(pointIn(fixture.name(c)));
    expect(fixture.order()).toEqual([a, b, c, d]);
    expect(fixture.calls.move).not.toHaveBeenCalled();
    expect(fixture.live()).toContain('canceled');

    await pickUp(fixture, a, rightEnd(fixture));
    await fixture.mouse.up(rightEnd(fixture));
    await frames();
    expect(fixture.order()).toEqual([b, c, d, a]);
    expect(fixture.store.getState().activeTabId).toBe(a);
    expect(fixture.presented()).toBe(b);
    expectClean(fixture);
  });

  it('keeps a subthreshold click, eye/close, and keyboard activation usable', async () => {
    const fixture = await mount();
    const [a, b, c] = fixture.ids as [string, string, string, string];
    const origin = pointIn(fixture.name(b));
    await fixture.mouse.hover(origin);
    await fixture.mouse.down(origin);
    await fixture.mouse.move({ x: origin.x + 3, y: origin.y });
    expect(grabbing(fixture)).toBe(false);
    await fixture.mouse.up({ x: origin.x + 3, y: origin.y });
    await frames();
    expect(fixture.calls.switch).toHaveBeenCalledExactlyOnceWith(b);
    expect(fixture.calls.move).not.toHaveBeenCalled();
    expect(fixture.order()).toEqual(fixture.ids);

    fixture.clearCalls();
    // An action press moved well past the threshold still cannot start sorting.
    await fixture.mouse.hover(pointIn(fixture.name(c)));
    const eye = pointIn(fixture.action(c, 'eye'));
    await fixture.mouse.down(eye);
    await fixture.mouse.move({ x: eye.x + 12, y: eye.y });
    expect(grabbing(fixture)).toBe(false);
    await fixture.mouse.up({ x: eye.x + 12, y: eye.y });
    fixture.clearCalls();
    await fixture.mouse.click(pointIn(fixture.action(c, 'eye')));
    expect(fixture.calls.present).toHaveBeenCalledExactlyOnceWith(c);
    expect(fixture.calls.switch).not.toHaveBeenCalled();
    await fixture.mouse.hover(pointIn(fixture.name(c)));
    await fixture.mouse.click(pointIn(fixture.action(c, 'close')));
    expect(fixture.calls.close).toHaveBeenCalledExactlyOnceWith(c);
    expect(fixture.order()).not.toContain(c);
    expect(fixture.calls.move).not.toHaveBeenCalled();

    fixture.tab(a).focus();
    fixture.clearCalls();
    await userEvent.keyboard('{Enter}');
    expect(fixture.calls.switch).toHaveBeenCalledExactlyOnceWith(a);
    expectClean(fixture);
  });

  for (const cancellation of ['Escape', 'blur', 'pointercancel'] as const) {
    it(`cancels on ${cancellation} without any incidental click, then accepts deliberate eye and close clicks`, async () => {
      const fixture = await mount();
      const [a, b, c] = fixture.ids as [string, string, string, string];
      const from = pointIn(fixture.name(a));
      const to = pointIn(fixture.name(c));
      // Synthetic pointer events reach the real owner-document listeners but cannot synthesize
      // a compatibility click. A stale "eat the next click" guard fails on the eye below.
      pointer(fixture, 'pointerdown', from);
      pointer(fixture, 'pointermove', to);
      await frames();
      expect(grabbing(fixture)).toBe(true);
      if (cancellation === 'Escape') ownerEscape(fixture);
      else if (cancellation === 'blur') fixture.win.dispatchEvent(new fixture.win.FocusEvent('blur'));
      else pointer(fixture, 'pointercancel', to);
      pointer(fixture, 'pointerup', to);
      await frames();
      expect(fixture.order()).toEqual(fixture.ids);
      expect(fixture.calls.move).not.toHaveBeenCalled();
      expect(fixture.live()).toContain('canceled');
      expectNoTabActions(fixture);
      expectNoMapInput(fixture);
      expectClean(fixture);

      await fixture.mouse.hover(pointIn(fixture.name(b)));
      await fixture.mouse.click(pointIn(fixture.action(b, 'eye')));
      expect(fixture.calls.present).toHaveBeenCalledExactlyOnceWith(b);
      await fixture.mouse.click(pointIn(fixture.action(b, 'close')));
      expect(fixture.calls.close).toHaveBeenCalledExactlyOnceWith(b);
      expect(fixture.calls.switch).not.toHaveBeenCalled();
      expect(fixture.calls.move).not.toHaveBeenCalled();

      // Repeat the same interruption with a real pressed mouse and its actual pointer ID.
      fixture.clearCalls();
      const nativeTarget = pointIn(fixture.name(c));
      await pickUp(fixture, a, nativeTarget);
      expect(grabbing(fixture)).toBe(true);
      if (cancellation === 'Escape') await userEvent.keyboard('{Escape}');
      else if (cancellation === 'blur') fixture.win.dispatchEvent(new fixture.win.FocusEvent('blur'));
      else pointer(fixture, 'pointercancel', nativeTarget, fixture.pointerId());
      await fixture.mouse.up(nativeTarget);
      await frames();
      expect(fixture.order()).toEqual(fixture.ids.filter((id) => id !== b));
      expect(fixture.calls.move).not.toHaveBeenCalled();
      expectNoTabActions(fixture);
      expectNoMapInput(fixture);
      expectClean(fixture);
    });
  }

  it('releases a real mouse drag over map content without moving a tab or acting on the map', async () => {
    const fixture = await mount();
    const from = fixture.ids[0]!;
    const map = pointIn(fixture.query('.atlas-scene-tab-test-map'), 0.5, 0.7);
    await pickUp(fixture, from, map);
    expect(grabbing(fixture)).toBe(true);
    expectNoMapInput(fixture);
    await fixture.mouse.up(map);
    await frames();
    expect(fixture.order()).toEqual(fixture.ids);
    expect(fixture.calls.move).not.toHaveBeenCalled();
    expectNoTabActions(fixture);
    expectNoMapInput(fixture);
    expectClean(fixture);
    const id = fixture.ids[1]!;
    await fixture.mouse.hover(pointIn(fixture.name(id)));
    await fixture.mouse.click(pointIn(fixture.action(id, 'eye')));
    expect(fixture.calls.present).toHaveBeenCalledExactlyOnceWith(id);
  });

  it('keeps scrolling at a stationary edge, updates the eventual drop, and leaves wheels and fixed controls usable', async () => {
    const fixture = await mount({ width: 440, names: Array.from({ length: 8 }, (_, index) => `Scene ${index + 1} with a long name`) });
    const source = fixture.ids[0]!;
    expect(fixture.strip.scrollWidth).toBeGreaterThan(fixture.strip.clientWidth);
    const add = fixture.query('.atlas-scene-tab-bar__add');
    const all = fixture.query('.atlas-scene-tab-bar__button:not(.atlas-scene-tab-bar__add)');
    const fixedBoxes = [add, all].map((element) => element.getBoundingClientRect().toJSON());
    const middle = pointIn(fixture.strip);
    await fixture.mouse.hover(middle);
    await wheel(fixture, middle, 0, 100);
    expect(fixture.strip.scrollLeft).toBeGreaterThan(0);
    const afterVerticalWheel = fixture.strip.scrollLeft;
    await wheel(fixture, middle, 80, 0);
    expect(fixture.strip.scrollLeft).toBeGreaterThan(afterVerticalWheel);
    fixture.strip.scrollLeft = 0;
    await frames();

    const edge = rightEnd(fixture);
    await pickUp(fixture, source, edge);
    const initialScroll = fixture.strip.scrollLeft;
    // No mouse.move calls while waiting: the animation loop must keep going on its own.
    await expect.poll(() => fixture.strip.scrollLeft, { timeout: 1500 }).toBeGreaterThan(initialScroll + 45);
    await expect.poll(() => fixture.strip.scrollWidth - fixture.strip.clientWidth - fixture.strip.scrollLeft, { timeout: 6000 }).toBeLessThanOrEqual(1);
    expect(fixture.order()).toEqual(fixture.ids);
    expect(fixture.calls.move).not.toHaveBeenCalled();
    expect([add, all].map((element) => element.getBoundingClientRect().toJSON())).toEqual(fixedBoxes);
    await page.screenshot({ path: '__screenshots__/scene-tab-reorder-narrow.png', element: fixture.host });
    await fixture.mouse.up(edge);
    await frames();
    expect(fixture.calls.move).toHaveBeenCalledExactlyOnceWith(source, null);
    expect(fixture.order()).toEqual([...fixture.ids.slice(1), source]);
    expectNoMapInput(fixture);
    expectClean(fixture);

    fixture.clearCalls();
    // The fixed plus sits outside the sortable strip; releasing there does not add or sort.
    await pickUp(fixture, source, pointIn(add));
    const beforeInvalidDrop = fixture.order();
    await fixture.mouse.up(pointIn(add));
    await frames();
    expect(fixture.order()).toEqual(beforeInvalidDrop);
    expect(fixture.calls.move).not.toHaveBeenCalled();
    expect(fixture.calls.add).not.toHaveBeenCalled();
    const stoppedAt = fixture.strip.scrollLeft;
    await frames(8);
    expect(fixture.strip.scrollLeft).toBe(stoppedAt);
    await fixture.mouse.click(pointIn(add));
    await fixture.mouse.click(pointIn(all));
    expect(fixture.calls.add).toHaveBeenCalledOnce();
    expect(fixture.calls.all).toHaveBeenCalledOnce();
  });

  it('preserves current metadata, cancels open/close changes, and rejects a same-ID reorder at the exact drop boundary', async () => {
    const fixture = await mount({ names: ['Amber scene with a long label', 'Blue scene with a long label', 'Copper scene with a long label', 'Distant scene with a long label'] });
    const [a, b, c, d] = fixture.ids as [string, string, string, string];
    const end = rightEnd(fixture);
    await pickUp(fixture, a, end);
    const width = fixture.tab(a).getBoundingClientRect().width;
    act(() => {
      fixture.store.getState().updateTabFilePath('Maps/Amber scene with a long label.atlasmap', 'Maps/Renamed.atlasmap', 'Renamed scene with a long label');
      fixture.store.getState().markTabDirty(a, true);
      fixture.store.getState().markTabLoaded(a);
    });
    await frames();
    expect(fixture.tab(a).getBoundingClientRect().width).toBe(width);
    expect(grabbing(fixture)).toBe(true);
    const currentMetadata = fixture.store.getState().tabs.find((tab) => tab.id === a);
    await fixture.mouse.up(end);
    await frames();
    expect(fixture.order()).toEqual([b, c, d, a]);
    expect(fixture.store.getState().tabs.find((tab) => tab.id === a)).toBe(currentMetadata);
    expect(currentMetadata).toMatchObject({ filePath: 'Maps/Renamed.atlasmap', displayName: 'Renamed scene with a long label', isDirty: true, isLoaded: true });

    fixture.clearCalls();
    await pickUp(fixture, b, pointIn(fixture.name(d)));
    act(() => { fixture.store.getState().addTab('Maps/New.atlasmap', 'New scene'); });
    const withNewTab = fixture.order();
    await frames();
    expect(grabbing(fixture)).toBe(false);
    await fixture.mouse.up(end);
    expect(fixture.order()).toEqual(withNewTab);
    expect(fixture.calls.move).not.toHaveBeenCalled();

    await pickUp(fixture, c, pointIn(fixture.name(a)));
    act(() => fixture.store.getState().removeTab(c));
    const afterClose = fixture.order();
    await frames();
    expect(grabbing(fixture)).toBe(false);
    await fixture.mouse.up(end);
    expect(fixture.order()).toEqual(afterClose);
    expect(fixture.order()).not.toContain(c);
    expect(fixture.calls.move).not.toHaveBeenCalled();

    // This listener is registered BEFORE the pointer session's capture listener. It changes
    // store order in the same pointerup dispatch, before React can run cancellation effects.
    let externalMoves = 0;
    const mutateBeforeDrop = (): void => { externalMoves++; fixture.store.getState().moveTab(a, b); };
    fixture.win.addEventListener('pointerup', mutateBeforeDrop, { capture: true, once: true });
    await pickUp(fixture, b, pointIn(fixture.name(a)));
    expect(grabbing(fixture)).toBe(true);
    const last = afterClose.filter((id) => id !== a);
    const expected = [a, ...last];
    await fixture.mouse.up(pointIn(fixture.name(a)));
    await frames();
    expect(externalMoves).toBe(1);
    expect(fixture.order()).toEqual(expected);
    expect(fixture.calls.move).not.toHaveBeenCalled();
    expectClean(fixture);
  });

  for (const changed of ['strip', 'tab'] as const) {
    it(`cancels when the real ${changed} dimensions change`, async () => {
      const fixture = await mount();
      const [a, , c] = fixture.ids as [string, string, string, string];
      await pickUp(fixture, a, pointIn(fixture.name(c)));
      expect(grabbing(fixture)).toBe(true);
      if (changed === 'strip') fixture.host.style.width = '380px';
      else fixture.tab(c).style.minWidth = `${fixture.tab(c).getBoundingClientRect().width + 32}px`;
      await expect.poll(() => grabbing(fixture)).toBe(false);
      await fixture.mouse.up(pointIn(fixture.strip));
      await frames();
      expect(fixture.order()).toEqual(fixture.ids);
      expect(fixture.calls.move).not.toHaveBeenCalled();
      expectClean(fixture);

      // Also cover the race before ResizeObserver/React effects can run: mutate dimensions
      // in an earlier capture listener during this very pointerup dispatch.
      fixture.host.style.width = '960px';
      fixture.tab(c).style.removeProperty('min-width');
      await frames();
      const changeAtDrop = (): void => {
        if (changed === 'strip') fixture.host.style.width = '380px';
        else fixture.tab(c).style.minWidth = `${fixture.tab(c).getBoundingClientRect().width + 32}px`;
      };
      fixture.win.addEventListener('pointerup', changeAtDrop, { capture: true, once: true });
      await pickUp(fixture, a, pointIn(fixture.name(c)));
      await fixture.mouse.up(pointIn(fixture.name(c)));
      await frames();
      expect(fixture.order()).toEqual(fixture.ids);
      expect(fixture.calls.move).not.toHaveBeenCalled();
      expectClean(fixture);
    });
  }

  it('uses a real iframe document for mouse drags and owner-document pointer, Escape and blur events', async () => {
    const fixture = await mount({ iframe: true, width: 600, names: Array.from({ length: 6 }, (_, index) => `Popout scene ${index + 1}`) });
    const [a, b, c] = fixture.ids as [string, string, string, string, string, string];
    expect(fixture.strip.ownerDocument).toBe(fixture.doc);
    expect(fixture.strip.win).toBe(fixture.win);
    expect(fixture.doc.win).toBe(fixture.win);
    expect(fixture.strip.doc).toBe(fixture.doc);
    expect(fixture.strip.scrollWidth).toBeGreaterThan(fixture.strip.clientWidth);
    const to = pointIn(fixture.name(c), 0.2);
    await pickUp(fixture, a, to);
    expect(grabbing(fixture)).toBe(true);
    expect(document.body.classList.contains('atlas-toolbar-grabbing')).toBe(false);
    await page.screenshot({ path: '__screenshots__/scene-tab-reorder-iframe.png', element: fixture.iframe! });
    await fixture.mouse.up(to);
    await frames(3, fixture.win);
    expect(fixture.order().slice(0, 3)).toEqual([b, a, c]);
    expect(fixture.calls.move).toHaveBeenCalledExactlyOnceWith(a, c);
    expectClean(fixture);

    fixture.clearCalls();
    // These events are constructed by, hit-tested in, and dispatched through the second realm.
    for (const cancellation of ['Escape', 'blur', 'pointercancel'] as const) {
      const from = pointIn(fixture.name(b));
      const over = pointIn(fixture.name(c));
      pointer(fixture, 'pointerdown', from);
      pointer(fixture, 'pointermove', over);
      await frames(2, fixture.win);
      expect(grabbing(fixture)).toBe(true);
      // Main-document events must not own the iframe's active gesture.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      window.dispatchEvent(new FocusEvent('blur'));
      expect(grabbing(fixture)).toBe(true);
      if (cancellation === 'Escape') ownerEscape(fixture);
      else if (cancellation === 'blur') fixture.win.dispatchEvent(new fixture.win.FocusEvent('blur'));
      else pointer(fixture, 'pointercancel', over);
      pointer(fixture, 'pointerup', over);
      await frames(2, fixture.win);
      expect(fixture.order().slice(0, 3)).toEqual([b, a, c]);
      expect(fixture.calls.move).not.toHaveBeenCalled();
      expectClean(fixture);
    }
    await fixture.mouse.hover(pointIn(fixture.name(c)));
    await fixture.mouse.click(pointIn(fixture.action(c, 'eye')));
    expect(fixture.calls.present).toHaveBeenCalledExactlyOnceWith(c);
    expectNoMapInput(fixture);
    expect(document.body.classList.contains('atlas-toolbar-grabbing')).toBe(false);
  });
});
