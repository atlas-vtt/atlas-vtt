// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin } from 'obsidian';
import { inEveryDocument } from '../../../src/app/platform/atlasDocuments';
import { createDeviceProfile, type PointerSource } from '../../../src/app/platform/deviceProfile';
import { POINTER_ATTRIBUTE, registerPointerAttribute } from '../../../src/app/platform/pointerAttribute';

type WindowListener = (workspaceWindow: unknown, win: { document: Document }) => void;

/** A plugin whose workspace opens and closes popouts when the test says so, and which unloads on `unload`. */
function fakePlugin(leafDocs: Document[] = []): { plugin: Plugin; open(doc: Document): void; close(doc: Document): void; unload(): void } {
  const listeners = new Map<string, WindowListener>();
  const cleanups: (() => void)[] = [];
  const plugin = {
    app: {
      workspace: {
        iterateAllLeaves: (visit: (leaf: { view: { containerEl: { doc: Document } } }) => void) => leafDocs.forEach((doc) => visit({ view: { containerEl: { doc } } })),
        on: (name: string, listener: WindowListener) => {
          listeners.set(name, listener);
          return {};
        },
        offref: () => undefined,
      },
    },
    registerEvent: () => undefined,
    register: (cleanup: () => void) => { cleanups.push(cleanup); },
  };
  return {
    plugin: plugin as unknown as Plugin,
    open: (doc) => listeners.get('window-open')?.({}, { document: doc }),
    close: (doc) => listeners.get('window-close')?.({}, { document: doc }),
    unload: () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup()),
  };
}

function pointer(coarse: boolean): PointerSource & { set(coarse: boolean): void } {
  let now = coarse;
  const listeners = new Set<() => void>();
  return {
    coarse: () => now,
    mouse: () => !now,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      now = next;
      listeners.forEach((listener) => listener());
    },
  };
}

const newDocument = (): Document => document.implementation.createHTMLDocument();

afterEach(() => document.body.removeAttribute(POINTER_ATTRIBUTE));

describe('the pointer attribute', () => {
  it('marks the body of the main window and of every open popout under a coarse pointer', () => {
    const popout = newDocument();
    const { plugin } = fakePlugin([popout]);
    registerPointerAttribute(plugin, createDeviceProfile({ isMobile: true, isPhone: false }, pointer(true)));
    expect(document.body.getAttribute(POINTER_ATTRIBUTE)).toBe('coarse');
    expect(popout.body.getAttribute(POINTER_ATTRIBUTE)).toBe('coarse');
  });

  it('leaves a desktop with a mouse as it was', () => {
    const { plugin } = fakePlugin();
    registerPointerAttribute(plugin, createDeviceProfile({ isMobile: false, isPhone: false }, pointer(false)));
    expect(document.body.hasAttribute(POINTER_ATTRIBUTE)).toBe(false);
  });

  it('follows the pointer as it changes, in every window', () => {
    const popout = newDocument();
    const source = pointer(true);
    const { plugin } = fakePlugin([popout]);
    registerPointerAttribute(plugin, createDeviceProfile({ isMobile: true, isPhone: false }, source));

    source.set(false);
    expect(document.body.hasAttribute(POINTER_ATTRIBUTE)).toBe(false);
    expect(popout.body.hasAttribute(POINTER_ATTRIBUTE)).toBe(false);
    source.set(true);
    expect(document.body.getAttribute(POINTER_ATTRIBUTE)).toBe('coarse');
    expect(popout.body.getAttribute(POINTER_ATTRIBUTE)).toBe('coarse');
  });

  it('marks a popout that opens later, and lets go of one that closes', () => {
    const popout = newDocument();
    const source = pointer(true);
    const { plugin, open, close } = fakePlugin();
    registerPointerAttribute(plugin, createDeviceProfile({ isMobile: true, isPhone: false }, source));

    open(popout);
    expect(popout.body.getAttribute(POINTER_ATTRIBUTE)).toBe('coarse');
    close(popout);
    expect(popout.body.hasAttribute(POINTER_ATTRIBUTE)).toBe(false);
    source.set(false);
    source.set(true);
    expect(popout.body.hasAttribute(POINTER_ATTRIBUTE)).toBe(false);
  });

  it('takes the mark away when Atlas unloads, and no longer follows the pointer', () => {
    const popout = newDocument();
    const source = pointer(true);
    const { plugin, unload } = fakePlugin([popout]);
    registerPointerAttribute(plugin, createDeviceProfile({ isMobile: true, isPhone: false }, source));

    unload();
    expect(document.body.hasAttribute(POINTER_ATTRIBUTE)).toBe(false);
    expect(popout.body.hasAttribute(POINTER_ATTRIBUTE)).toBe(false);
    source.set(false);
    source.set(true);
    expect(document.body.hasAttribute(POINTER_ATTRIBUTE)).toBe(false);
  });
});

describe('every document Atlas renders in', () => {
  it('is entered once, and left when its window closes or Atlas unloads', () => {
    const popout = newDocument();
    const later = newDocument();
    const log: string[] = [];
    const name = (doc: Document): string => (doc === document ? 'main' : doc === popout ? 'popout' : 'later');
    const { plugin, open, close, unload } = fakePlugin([popout, popout, document]);
    inEveryDocument(plugin, (doc) => {
      log.push(`enter ${name(doc)}`);
      return () => log.push(`leave ${name(doc)}`);
    });

    open(later);
    open(later);
    close(popout);
    close(popout);
    unload();

    expect(log).toEqual(['enter main', 'enter popout', 'enter later', 'leave popout', 'leave main', 'leave later']);
  });
});
