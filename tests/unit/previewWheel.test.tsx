// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { scrollOnCtrlWheel } from '../../src/app/services/previewWheel';
import { EncounterFolderPreview } from '../../src/app/services/EncounterFolderPreview';
import { MapLinkPreview } from '../../src/app/services/MapLinkPreview';
import { NotePreviewWindow } from '../../src/app/services/NotePreviewWindow';
import { StatblockPreviewWindow } from '../../src/app/services/StatblockPreviewWindow';
import { StatblockHoverPreview } from '../../src/app/react/components/StatblockHoverPreview';
import type { NotePin } from '../../src/app/types';

vi.mock('../../src/app/statblocks/render/LinkedStatblock', () => ({ LinkedStatblock: (): null => null }));

interface Scroller {
  height: number;
  content: number;
}

/** jsdom lays nothing out: a box's overflow and its sizes are what a browser would measure. */
function box(parent: HTMLElement, scroller?: Scroller): HTMLElement {
  const element = parent.createDiv();
  if (!scroller) return element;
  element.style.overflowY = 'auto';
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: scroller.height });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scroller.content });
  return element;
}

function wheel(target: Element, init: WheelEventInit): WheelEvent {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  cleanup();
  document.body.empty();
});

describe('a wheel over a hover preview', () => {
  it('scrolls the preview with Ctrl held, where the browser itself would not', () => {
    const preview = document.body.createDiv();
    const body = box(preview, { height: 100, content: 500 });
    scrollOnCtrlWheel(preview);

    const event = wheel(box(body), { ctrlKey: true, deltaY: 120 });

    expect(body.scrollTop).toBe(120);
    expect(event.defaultPrevented).toBe(true);
  });

  it('never reaches a note view inside, whose Ctrl+wheel changes Obsidian\'s font size', () => {
    const preview = document.body.createDiv();
    const noteView = box(preview, { height: 100, content: 500 });
    const fontSizeAction = vi.fn();
    noteView.addEventListener('wheel', fontSizeAction, { passive: true });
    scrollOnCtrlWheel(preview);

    wheel(box(noteView), { ctrlKey: true, deltaY: 120 });

    expect(fontSizeAction).not.toHaveBeenCalled();
  });

  it('goes on to the box around a scroller at its end, as a browser\'s own scrolling does', () => {
    const preview = document.body.createDiv();
    const outer = box(preview, { height: 100, content: 500 });
    const inner = box(outer, { height: 50, content: 200 });
    scrollOnCtrlWheel(preview);

    inner.scrollTop = 150;
    wheel(inner, { ctrlKey: true, deltaY: 40 });
    expect(inner.scrollTop).toBe(150);
    expect(outer.scrollTop).toBe(40);

    wheel(inner, { ctrlKey: true, deltaY: -40 });
    expect(inner.scrollTop).toBe(110);
    expect(outer.scrollTop).toBe(40);
  });

  it('counts a wheel that reports lines or pages in pixels', () => {
    const preview = document.body.createDiv();
    const body = box(preview, { height: 100, content: 5000 });
    scrollOnCtrlWheel(preview);

    wheel(body, { ctrlKey: true, deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE });
    expect(body.scrollTop).toBe(48);

    wheel(body, { ctrlKey: true, deltaY: 1, deltaMode: WheelEvent.DOM_DELTA_PAGE });
    expect(body.scrollTop).toBe(148);
  });

  it('is swallowed where there is nothing to scroll, so the page does not zoom under it', () => {
    const preview = document.body.createDiv();
    const short = box(preview, { height: 100, content: 100 });
    const inner = vi.fn();
    short.addEventListener('wheel', inner);
    scrollOnCtrlWheel(preview);

    const event = wheel(short, { ctrlKey: true, deltaY: 120 });

    expect(event.defaultPrevented).toBe(true);
    expect(inner).not.toHaveBeenCalled();
    expect(short.scrollTop).toBe(0);
  });

  it('never scrolls a box around the preview', () => {
    const scrolledPage = box(document.body, { height: 100, content: 500 });
    const preview = box(scrolledPage);
    scrollOnCtrlWheel(preview);

    wheel(preview, { ctrlKey: true, deltaY: 120 });

    expect(scrolledPage.scrollTop).toBe(0);
  });

  it('leaves every wheel without Ctrl to the browser, Cmd on macOS too, whose scrolling is smoother', () => {
    const preview = document.body.createDiv();
    const body = box(preview, { height: 100, content: 500 });
    const inner = vi.fn();
    body.addEventListener('wheel', inner);
    scrollOnCtrlWheel(preview);

    const plain = wheel(body, { deltaY: 120 });
    const withCmd = wheel(body, { metaKey: true, deltaY: 120 });

    expect(plain.defaultPrevented).toBe(false);
    expect(withCmd.defaultPrevented).toBe(false);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(body.scrollTop).toBe(0);
  });

  it('leaves Ctrl+wheel beside the preview alone, so the map still zooms', () => {
    const preview = document.body.createDiv();
    const map = document.body.createDiv();
    const zoom = vi.fn();
    map.addEventListener('wheel', zoom);
    scrollOnCtrlWheel(preview);

    const event = wheel(map, { ctrlKey: true, deltaY: 120 });

    expect(zoom).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops when it is taken off', () => {
    const preview = document.body.createDiv();
    const stop = scrollOnCtrlWheel(preview);

    stop();

    expect(wheel(preview, { ctrlKey: true, deltaY: 120 }).defaultPrevented).toBe(false);
  });
});

describe('every preview that Mod+hover opens keeps Ctrl+wheel inside itself', () => {
  const pin: NotePin = { id: 'p1', kind: 'pin', x: 0, y: 0, notePath: 'Note.md' };
  const manager = { handlePreviewClosed: vi.fn(), mapViewElement: (): null => null };

  function swallowed(selector: string): boolean {
    return wheel(document.querySelector(selector)!, { ctrlKey: true, deltaY: 120 }).defaultPrevented;
  }

  it('a note preview', () => {
    const app = { vault: { getAbstractFileByPath: (): null => null }, workspace: {} };
    new NotePreviewWindow(app as never, 'Note.md', pin, manager as never, { x: 0, y: 0 });
    expect(swallowed('.atlas-note-preview-window')).toBe(true);
  });

  it('a token\'s statblock window', () => {
    act(() => { new StatblockPreviewWindow({} as never, 'Goblin.md', { id: 't1', name: 'Goblin' }, null, { x: 0, y: 0 }); });
    expect(swallowed('.atlas-statblock-preview-window')).toBe(true);
  });

  it('an initiative card\'s statblock', () => {
    render(React.createElement(StatblockHoverPreview, { notePath: 'Goblin.md', isVisible: true, isClosing: false, position: { x: 0, y: 0 } }));
    expect(swallowed('.statblock-hover-preview')).toBe(true);
  });

  it('a linked scene\'s card', () => {
    const app = { vault: { getAbstractFileByPath: (): null => null, adapter: { exists: async (): Promise<boolean> => false } } };
    new MapLinkPreview(app as never, new TFile('Tavern.atlasmap'), pin, manager as never, { x: 0, y: 0 });
    expect(swallowed('.atlas-map-link-preview')).toBe(true);
  });

  it('an encounter folder\'s card', () => {
    new EncounterFolderPreview({ folder: 'Wilds', encounters: [], pin, position: { x: 0, y: 0 }, doc: document, roll: vi.fn(), place: vi.fn(), onClosed: vi.fn() });
    expect(swallowed('.atlas-encounter-folder-preview')).toBe(true);
  });
});
