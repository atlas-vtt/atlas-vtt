// @vitest-environment jsdom
import type { Plugin } from 'obsidian';
import { createElement, type ReactElement } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { registerPageListenerRelease } from '../../src/app/plugin/pageListenerRelease';
import { portalHost, releasePortalHosts } from '../../src/app/host/portalHost';

type Listener = EventListenerOrEventListenerObject;

/** The listeners added to `target` from now on and not removed again, by type. */
function trackListeners(target: EventTarget): Map<Listener, string> {
  const live = new Map<Listener, string>();
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  Object.defineProperty(target, 'addEventListener', { configurable: true, writable: true, value: (type: string, listener: Listener | null, options?: boolean | AddEventListenerOptions): void => {
    if (listener) live.set(listener, type);
    add(type, listener, options);
  } });
  Object.defineProperty(target, 'removeEventListener', { configurable: true, writable: true, value: (type: string, listener: Listener | null, options?: boolean | EventListenerOptions): void => {
    if (listener) live.delete(listener);
    remove(type, listener, options);
  } });
  return live;
}

/** A media query list as Chromium's: `addListener` adds a `change` listener. */
class FakeQuery extends EventTarget {
  readonly matches = false;
  constructor(readonly media: string) { super(); }
  addListener(listener: (event: Event) => void): void { this.addEventListener('change', listener); }
  removeListener(listener: (event: Event) => void): void { this.removeEventListener('change', listener); }
}

/** What Obsidian hands `registerPageListenerRelease`: cleanups run at unload, no other windows. */
function fakePlugin(): { plugin: Plugin; unload: () => void } {
  const cleanups: Array<() => void> = [];
  const plugin = {
    app: { workspace: { iterateAllLeaves: (): void => undefined, on: (): object => ({}) } },
    register: (cleanup: () => void): void => { cleanups.push(cleanup); },
    registerEvent: (): void => undefined,
  } as unknown as Plugin;
  return { plugin, unload: () => { for (const cleanup of cleanups.reverse()) cleanup(); } };
}

const reactMarks = (node: object): string[] => Object.keys(node).filter((key) => key.startsWith('_reactListening'));

function Floating(): ReactElement {
  return createPortal(createElement('div', { className: 'menu-like' }, 'menu'), portalHost());
}

describe('what Atlas leaves on the page when it unloads', () => {
  it('leaves no listener, node or React mark of its own on the window, the document or <body>', () => {
    const queries: FakeQuery[] = [];
    window.matchMedia = (media: string): MediaQueryList => {
      const query = new FakeQuery(media);
      queries.push(query);
      return query as unknown as MediaQueryList;
    };
    // jsdom's selector engine puts its own listeners on the document when first used.
    document.querySelector('.atlas-portal-host');
    const windowListeners = trackListeners(window);
    const documentListeners = trackListeners(document);
    const bodyBefore = document.body.children.length;

    // onload: first of all, before anything of Atlas renders.
    const { plugin, unload } = fakePlugin();
    registerPageListenerRelease(plugin);
    // framer-motion's listeners were taken while its root was made: they are on the window now.
    expect([...windowListeners.values()]).toContain('resize');
    expect(queries.map((query) => query.media)).toContain('(prefers-reduced-motion)');
    const queryListeners = queries.map((query) => trackListeners(query));

    // A root in Atlas' host with a portal, as the asset manager and every menu and tooltip have.
    const root = createRoot(portalHost().createDiv());
    flushSync(() => root.render(createElement(Floating)));
    expect(document.body.querySelector('.atlas-portal-host .menu-like')).not.toBeNull();
    expect(reactMarks(document.body)).toEqual([]);
    expect(reactMarks(document)).toHaveLength(1);
    expect(documentListeners.size).toBe(0);

    // onunload: the roots go, then the cleanups, then the hosts.
    root.unmount();
    unload();
    releasePortalHosts();

    expect(document.body.children).toHaveLength(bodyBefore);
    expect(reactMarks(document.body)).toEqual([]);
    expect(reactMarks(document)).toEqual([]);
    expect(windowListeners.size).toBe(0);
    expect(documentListeners.size).toBe(0);
    for (const listeners of queryListeners) expect(listeners.size).toBe(0);
  });

  it('is what keeps React off the document: unguarded, a root listens there for good', () => {
    const documentListeners = trackListeners(document);
    const root = createRoot(portalHost().createDiv());
    flushSync(() => root.render(createElement(Floating)));
    root.unmount();
    releasePortalHosts();
    expect([...documentListeners.values()]).toEqual(['selectionchange']);
  });
});
