// @vitest-environment jsdom
import React, { useRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mayCover, mayUncover } from '../../../src/app/packages/components/toolbar/useSelectionActionsShown';
import { useSelectionBarPlace, type BarPlaceOptions, type ShownOnCanvas } from '../../../src/app/packages/components/toolbar/useSelectionBarPlace';

/** The map's frame clock: a test runs its frames by hand. */
const ticker = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return { add: (run: () => void) => listeners.add(run), remove: (run: () => void) => listeners.delete(run), frame: () => listeners.forEach((run) => run()) };
});
const view = vi.hoisted(() => ({ selectedIds: ['token'] }));

vi.mock('../../../src/app/react/root/AtlasUIContext', () => ({
  useAtlasUI: () => ({
    pixiApp: { ticker },
    renderer: { getViewportInstance: () => ({}), getCanvasElement: () => document.querySelector('canvas') },
  }),
}));
vi.mock('../../../src/app/react/ViewStoreContext', () => ({ useViewStoreHook: () => ({ getState: () => view }) }));

afterEach(cleanup);

/** A bar in a map area, as the selection's bars stand: `offsetParent` is the area, which jsdom never lays out. */
function Bar({ shown, options }: { shown: ShownOnCanvas; options: BarPlaceOptions }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useSelectionBarPlace(ref, shown, options);
  return <div className="area"><canvas /><div ref={ref} className="bar" /></div>;
}

function mount(): { bar: HTMLElement; at: { x: number }; centred: ReturnType<typeof vi.fn>; widthRead: ReturnType<typeof vi.fn>; queries: ReturnType<typeof vi.spyOn> } {
  const at = { x: 400 };
  const centred = vi.fn(() => 300);
  const widthRead = vi.fn(() => 300);
  const offsetParent = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) { return this.parentElement; });
  const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(widthRead);
  const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(56);
  // The map area and its canvas: 1180 x 820, at the window's corner
  const rects = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1180, 820));
  const shown: ShownOnCanvas = () => [{ x: at.x, y: 300 }, { x: at.x + 80, y: 380 }];
  const options: BarPlaceOptions = { prefer: 'above', yields: true, centred };
  const { container } = render(<Bar shown={shown} options={options} />);
  const queries = vi.spyOn(Element.prototype, 'querySelectorAll');
  afterEach(() => {
    offsetParent.mockRestore();
    offsetWidth.mockRestore();
    offsetHeight.mockRestore();
    rects.mockRestore();
    queries.mockRestore();
  });
  return { bar: container.querySelector<HTMLElement>('.bar')!, at, centred, widthRead, queries };
}

describe('the bar beside a selection, frame by frame', () => {
  it('reads nothing of the page in a frame in which the selection shows where it did', () => {
    const { bar, centred, widthRead, queries } = mount();
    const placed = bar.style.translate;
    expect(placed).not.toBe('');
    centred.mockClear();
    widthRead.mockClear();
    for (let i = 0; i < 20; i++) ticker.frame();
    expect(centred).not.toHaveBeenCalled();
    expect(widthRead).not.toHaveBeenCalled();
    expect(queries).not.toHaveBeenCalled();
    expect(bar.style.translate).toBe(placed);
  });

  it('follows the selection in the frame it moves, without measuring itself again', () => {
    const { bar, at, centred, widthRead } = mount();
    const placed = bar.style.translate;
    centred.mockClear();
    widthRead.mockClear();
    at.x = 460;
    ticker.frame();
    expect(bar.style.translate).not.toBe(placed);
    expect(centred).not.toHaveBeenCalled();
    expect(widthRead).not.toHaveBeenCalled();
  });
});

describe('what the bar looks for when the page changes', () => {
  /** The changes the page reports after `change`, as the bar's observer hears them. */
  function changes(host: HTMLElement, change: () => void): MutationRecord[] {
    const observer = new MutationObserver(() => undefined);
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    change();
    const records = observer.takeRecords();
    observer.disconnect();
    return records;
  }
  const host = (): HTMLElement => document.body.appendChild(document.createElement('div'));
  const menu = (state: string): HTMLElement => {
    const wrapper = document.createElement('div');
    const content = wrapper.appendChild(document.createElement('div'));
    content.className = 'atlas-ctx-menu';
    content.dataset.state = state;
    return wrapper;
  };

  it('is nothing for what cannot stand over the map: a tooltip, the rows of a list', () => {
    const page = host();
    const records = changes(page, () => {
      page.appendChild(document.createElement('div')).className = 'atlas-tooltip';
      const list = page.appendChild(document.createElement('ul'));
      for (let i = 0; i < 50; i++) list.appendChild(document.createElement('li'));
    });
    expect(records.length).toBeGreaterThan(0);
    expect(records.some(mayCover)).toBe(false);
  });

  it('is a menu that opens, a dialog and the popover of a value, however deep they are added', () => {
    const page = host();
    expect(changes(page, () => page.appendChild(menu('open'))).some(mayCover)).toBe(true);
    expect(changes(page, () => { page.appendChild(document.createElement('div')).appendChild(document.createElement('div')).className = 'atlas-modal-overlay'; }).some(mayCover)).toBe(true);
    expect(changes(page, () => { page.appendChild(document.createElement('div')).className = 'atlas-token-value-editor'; }).some(mayCover)).toBe(true);
  });

  it('is a menu that closes or anything that goes, once something stands over the map', () => {
    const page = host();
    const open = page.appendChild(menu('open'));
    const closing = changes(page, () => { open.querySelector<HTMLElement>('.atlas-ctx-menu')!.dataset.state = 'closed'; });
    expect(closing.some(mayUncover)).toBe(true);
    expect(changes(page, () => open.remove()).some(mayUncover)).toBe(true);
    // What is added, or changes its state elsewhere, takes nothing away
    const added = changes(page, () => {
      const other = page.appendChild(document.createElement('div'));
      other.dataset.state = 'open';
    });
    expect(added.some(mayUncover)).toBe(false);
  });
});
