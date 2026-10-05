import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDomHost, installDomHost } from '../../src/app/host/dom';
import { pluginDomHost } from '../../src/app/plugin/host/dom';
import { observeResize } from '../../src/app/utils/observeResize';

let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; document.body.empty(); vi.restoreAllMocks(); });

describe('DOM host', () => {
  it('requires an implementation before use', async () => {
    vi.resetModules();
    const fresh = await import('../../src/app/host/dom');
    expect(() => fresh.getDomHost()).toThrow('DOM host');
  });

  it('adopts a canvas before a context is requested', () => {
    const frame = document.body.createEl('iframe');
    const doc = frame.contentDocument!;
    const create = vi.spyOn(globalThis, 'createEl');
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    restore = installDomHost(pluginDomHost);
    const canvas = getDomHost().createCanvas(doc);
    expect(canvas.ownerDocument).toBe(doc);
    expect(create).toHaveBeenCalledWith('canvas');
    expect(context).not.toHaveBeenCalled();
  });

  it('reads the active document on every call', () => {
    const frame = document.body.createEl('iframe');
    let current = document;
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'activeDocument')!;
    Object.defineProperty(globalThis, 'activeDocument', { configurable: true, get: () => current });
    expect(pluginDomHost.activeDocument()).toBe(document);
    current = frame.contentDocument!;
    expect(pluginDomHost.activeDocument()).toBe(current);
    Object.defineProperty(globalThis, 'activeDocument', descriptor);
  });

  it('uses the owning window for resize observation', () => {
    const frame = document.body.createEl('iframe');
    const win = frame.contentWindow!;
    const target = frame.contentDocument!.body;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const Observer = vi.fn(function () { return { observe, disconnect }; });
    Object.defineProperty(win, 'ResizeObserver', { configurable: true, value: Observer });
    // The iframe has its own prototypes; model Obsidian's owner-window extension.
    Object.defineProperty(target, 'win', { configurable: true, get: () => win });
    restore = installDomHost(pluginDomHost);
    const callback = vi.fn();
    const stop = observeResize([target], callback);
    expect(getDomHost().ownerWindow(target)).toBe(win);
    expect(Observer).toHaveBeenCalledWith(callback);
    expect(observe).toHaveBeenCalledWith(target);
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
