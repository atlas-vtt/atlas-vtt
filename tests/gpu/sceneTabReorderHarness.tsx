import '../setup/obsidianDom';
import React, { useState } from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { cdp } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import tabsCss from '../../src/app/react/components/scene-tab-bar.scss?inline';
import tooltipCss from '../../src/app/packages/components/primitives/tooltip.css?inline';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { DASHBOARD_THEME } from './dashboardTheme';
import { mouse } from './realMouse';

export type OwnerWindow = Window & typeof globalThis;
export interface Point { x: number; y: number }
export const DEFAULT_NAMES = ['Amber Keep', 'Blue Cavern', 'Copper Wood', 'Distant Gate'];
export const SYNTHETIC_POINTER_ID = 71;

/** Obsidian installs helpers per realm; do not copy accessors closed over the main document. */
function installRealmHelpers(win: OwnerWindow): () => void {
  const previous: Array<{ target: object; key: string; descriptor: PropertyDescriptor | undefined }> = [];
  const define = (target: object, key: string, descriptor: PropertyDescriptor): void => {
    previous.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
    Object.defineProperty(target, key, { configurable: true, ...descriptor });
  };
  const documentOf = (node: Node): Document => node.nodeType === 9 ? node as Document : node.ownerDocument ?? win.document;
  define(win.Node.prototype, 'doc', { get(this: Node) { return documentOf(this); } });
  define(win.Node.prototype, 'win', { get(this: Node) { return documentOf(this).defaultView ?? win; } });
  define(win.Element.prototype, 'addClass', { value(this: Element, ...names: string[]) { this.classList.add(...names); }, writable: true });
  define(win.Element.prototype, 'removeClass', { value(this: Element, ...names: string[]) { this.classList.remove(...names); }, writable: true });
  return () => {
    for (const { target, key, descriptor } of previous.reverse()) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    }
  };
}

export async function frames(count = 3, win: Window = window): Promise<void> {
  for (let index = 0; index < count; index++) await new Promise<void>((resolve) => win.requestAnimationFrame(() => resolve()));
}

export function pointIn(element: Element, x = 0.5, y = 0.5): Point {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width * x, y: box.top + box.height * y };
}

/** Translate iframe client coordinates before realMouse translates the Vitest runner's iframe. */
function inTestFrame(win: Window, point: Point): Point {
  let current = win;
  let result = point;
  while (current !== window) {
    const frame = current.frameElement;
    if (!frame) throw new Error('The scene-tab fixture is not a descendant of the test frame.');
    const box = frame.getBoundingClientRect();
    result = { x: box.left + result.x * box.width / current.innerWidth, y: box.top + result.y * box.height / current.innerHeight };
    const parent = frame.ownerDocument.defaultView;
    if (!parent) throw new Error('The fixture frame has no parent window.');
    current = parent;
  }
  return result;
}

export async function mountSceneTabs(options: { names?: string[]; width?: number; iframe?: boolean } = {}) {
  let iframe: HTMLIFrameElement | null = null;
  let win = window as OwnerWindow;
  if (options.iframe) {
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'display:block;width:1000px;height:400px;border:0;margin:24px';
    const loaded = new Promise<void>((resolve) => iframe!.addEventListener('load', () => resolve(), { once: true }));
    iframe.srcdoc = '<!doctype html><html><head></head><body></body></html>';
    document.body.append(iframe);
    await loaded;
    if (!iframe.contentWindow) throw new Error('No iframe window.');
    win = iframe.contentWindow as OwnerWindow;
  }
  const doc = win.document;
  const restoreHelpers = installRealmHelpers(win);
  const hadTheme = doc.body.classList.contains('theme-dark');
  doc.body.classList.add('theme-dark');
  const style = doc.createElement('style');
  style.textContent = DASHBOARD_THEME + css + tabsCss + tooltipCss;
  doc.head.append(style);
  const host = doc.createElement('div');
  host.style.cssText = `position:relative;width:${options.width ?? 960}px;height:320px;margin:16px`;
  doc.body.append(host);

  const store = createTabMetaStore();
  const ids = (options.names ?? DEFAULT_NAMES).map((name) => store.getState().addTab(`Maps/${name}.atlasmap`, name));
  if (!ids[0]) throw new Error('The fixture needs at least one tab.');
  store.getState().setActiveTab(ids[0]);
  // Keep the source inactive and the eye on another scene in the ordinary move tests.
  let presentedId: string | null = ids[1] ?? ids[0];
  const calls = {
    move: vi.fn((id: string, beforeId: string | null) => store.getState().moveTab(id, beforeId)),
    switch: vi.fn((id: string) => store.getState().setActiveTab(id)),
    close: vi.fn((id: string) => store.getState().removeTab(id)),
    present: vi.fn<(id: string) => void>(),
    add: vi.fn(), all: vi.fn(),
    mapMove: vi.fn(), mapUp: vi.fn(), mapClick: vi.fn(), mapEscape: vi.fn(),
  };
  const mapEscape = (event: KeyboardEvent): void => { if (event.key === 'Escape') calls.mapEscape(); };
  doc.addEventListener('keydown', mapEscape);
  let pointerId = SYNTHETIC_POINTER_ID;
  const rememberPointer = (event: PointerEvent): void => { pointerId = event.pointerId; };
  doc.addEventListener('pointerdown', rememberPointer, true);
  const { app } = createInMemoryApp({ files: {} });
  const value = { app, view: { viewId: 'scene-tabs-gpu', tabMetaStore: store }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
  function Fixture(): React.ReactElement {
    const [shown, setShown] = useState(presentedId);
    return <div className="atlas-vtt-plugin atlas-react-ui-container" style={{ position: 'absolute', inset: 0 }}>
      <div className="atlas-scene-tab-test-map" style={{ position: 'absolute', inset: 0 }}
        onPointerMove={calls.mapMove} onPointerUp={calls.mapUp} onClick={calls.mapClick} />
      <div className="atlas-ui" style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
        <AtlasUIContext.Provider value={value}>
          <div className="atlas-top-bar-row">
            <SceneTabBar onMoveTab={calls.move} onSwitchTab={calls.switch} onCloseTab={calls.close}
              onPresentTab={(id) => { calls.present(id); presentedId = id; setShown(id); }} presentedTabId={shown}
              onAddTab={calls.add} onShowAllTabs={calls.all} />
          </div>
        </AtlasUIContext.Provider>
      </div>
    </div>;
  }
  const rendered = render(<Fixture />, { container: host, baseElement: doc.body });
  await frames(4, win);
  const query = (selector: string): HTMLElement => {
    const result = host.querySelector<HTMLElement>(selector);
    if (!result) throw new Error(`Missing ${selector}`);
    return result;
  };
  const strip = query('[role="tablist"]');
  const tab = (id: string): HTMLElement => query(`[role="tab"][data-scene-tab-id="${CSS.escape(id)}"]`);
  const name = (id: string): HTMLElement => tab(id).querySelector<HTMLElement>('.atlas-scene-tab__name')!;
  const action = (id: string, which: 'eye' | 'close'): HTMLElement => {
    const buttons = tab(id).querySelectorAll<HTMLElement>('button');
    const result = buttons[which === 'eye' ? 0 : buttons.length - 1];
    if (!result) throw new Error(`Missing ${which} button on ${id}`);
    return result;
  };
  const mouseIn = {
    down: async (point: Point) => { const at = inTestFrame(win, point); await mouse.down(at.x, at.y); },
    move: async (point: Point) => { const at = inTestFrame(win, point); await mouse.move(at.x, at.y); },
    up: async (point: Point) => { const at = inTestFrame(win, point); await mouse.up(at.x, at.y); },
    hover: async (point: Point) => { const at = inTestFrame(win, point); await mouse.hover(at.x, at.y); },
    click: async (point: Point) => { const at = inTestFrame(win, point); await mouse.hover(at.x, at.y); await mouse.click(at.x, at.y); },
  };
  return {
    win, doc, iframe, host, store, ids, calls, strip, tab, name, action, query, mouse: mouseIn,
    presented: () => presentedId,
    pointerId: () => pointerId,
    order: () => store.getState().tabs.map((item) => item.id),
    domOrder: () => Array.from(strip.querySelectorAll<HTMLElement>('[role="tab"][data-scene-tab-id]')).map((item) => item.dataset.sceneTabId),
    live: () => host.querySelector('[role="status"], [aria-live="polite"]')?.textContent?.trim() ?? '',
    clearCalls: () => { for (const spy of Object.values(calls)) spy.mockClear(); },
    dispose: () => {
      rendered.unmount();
      doc.removeEventListener('keydown', mapEscape);
      doc.removeEventListener('pointerdown', rememberPointer, true);
      host.remove(); style.remove(); restoreHelpers();
      if (!hadTheme) doc.body.classList.remove('theme-dark');
      iframe?.remove();
    },
  };
}

export type SceneTabsHarness = Awaited<ReturnType<typeof mountSceneTabs>>;

export async function pickUp(harness: SceneTabsHarness, id: string, to: Point): Promise<void> {
  const from = pointIn(harness.name(id));
  await harness.mouse.hover(from);
  await harness.mouse.down(from);
  for (let step = 1; step <= 8; step++) {
    await harness.mouse.move({ x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 });
    await frames(1, harness.win);
  }
}

/** Untrusted owner-realm events intentionally generate no compatibility click on release. */
export function pointer(harness: SceneTabsHarness, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', point: Point, pointerId = SYNTHETIC_POINTER_ID): void {
  const target = harness.doc.elementFromPoint(point.x, point.y) ?? harness.doc.body;
  target.dispatchEvent(new harness.win.PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, view: harness.win, clientX: point.x, clientY: point.y,
    pointerId, pointerType: 'mouse', isPrimary: true,
    button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
  }));
}

export function ownerEscape(harness: SceneTabsHarness): void {
  harness.doc.dispatchEvent(new harness.win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
}

export async function wheel(harness: SceneTabsHarness, at: Point, deltaX: number, deltaY: number): Promise<void> {
  const local = inTestFrame(harness.win, at);
  const host = window.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  await cdp().send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: host.left + local.x * host.width / window.innerWidth, y: host.top + local.y * host.height / window.innerHeight,
    deltaX, deltaY, buttons: 0,
  });
  await frames(4, harness.win);
}
