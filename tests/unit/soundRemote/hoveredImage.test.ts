// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App, type Workspace } from 'obsidian';
import { ImageDisplayService } from '@/app/services/ImageDisplayService';
import { HoveredElement } from '@/app/soundRemote/hoveredElement';

vi.mock('@/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: vi.fn() }));

const workspace = { iterateAllLeaves: () => undefined, on: () => ({}), offref: vi.fn() } as unknown as Workspace;

afterEach(() => { document.body.innerHTML = ''; });

describe('the element under the pointer', () => {
  it('is remembered on hover, kept when the window loses focus, and forgotten when the pointer leaves', () => {
    const hovered = new HoveredElement(workspace);
    hovered.start();
    const img = document.body.appendChild(document.createElement('img'));
    img.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(hovered.element()).toBe(img);
    window.dispatchEvent(new Event('blur'));
    expect(hovered.element()).toBe(img);
    document.documentElement.dispatchEvent(new Event('pointerleave'));
    expect(hovered.element()).toBeNull();
    hovered.dispose();
  });

  it('listens only between start and dispose', () => {
    const hovered = new HoveredElement(workspace);
    const img = document.body.appendChild(document.createElement('img'));
    img.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(hovered.element()).toBeNull();
    hovered.start();
    hovered.dispose();
    img.dispatchEvent(new Event('pointerover', { bubbles: true }));
    expect(hovered.element()).toBeNull();
  });
});

describe('the image a remote may show', () => {
  const map = new TFile('Art/map.png');
  const service = new ImageDisplayService({
    workspace: { getActiveFile: () => null },
    vault: { getAbstractFileByPath: (path: string) => (path === map.path ? map : null), adapter: {} },
    metadataCache: { getFirstLinkpathDest: (link: string) => (link === 'map.png' ? map : null) },
  } as unknown as App);

  const imageIn = (html: string): Element => {
    document.body.innerHTML = html;
    return document.body.querySelector('img')!;
  };

  it('is a vault image in a note, as the image menu offers it', () => {
    expect(service.imageFileAt(imageIn('<div class="markdown-preview-view"><div class="internal-embed image-embed" src="map.png"><img src="data:image/png;base64,AA=="></div></div>'))).toBe(map);
  });

  it('is found while the body carries Atlas classes, and in a note Atlas previews', () => {
    const note = '<div class="markdown-preview-view"><div class="internal-embed image-embed" src="map.png"><img src="data:image/png;base64,AA=="></div></div>';
    document.body.className = 'atlas-hide-status-bar atlas-statblock-preview-shown';
    expect(service.imageFileAt(imageIn(note))).toBe(map);
    document.body.className = '';
    expect(service.imageFileAt(imageIn(`<div class="atlas-note-preview-window">${note}</div>`))).toBe(map);
  });

  it('is none for Atlas\' own UI, a dialog, or a picture from elsewhere', () => {
    expect(service.imageFileAt(imageIn('<div class="atlas-toolbar"><div class="internal-embed image-embed" src="map.png"><img></div></div>'))).toBeNull();
    expect(service.imageFileAt(imageIn('<div class="modal-container"><div class="internal-embed image-embed" src="map.png"><img></div></div>'))).toBeNull();
    expect(service.imageFileAt(imageIn('<div class="markdown-preview-view"><img src="https://example.com/map.png"></div>'))).toBeNull();
  });
});
