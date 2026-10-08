import { describe, expect, it, vi } from 'vitest';
import type { DomHost } from '../../../src/shared/dice3d';

/** The plain browser's DOM, as a page outside Obsidian hands it over. */
function pageHost(): DomHost {
  return {
    createCanvas: vi.fn((doc = document, size?: { width: number; height: number }) => {
      const canvas = doc.createElement('canvas');
      if (size) { canvas.width = size.width; canvas.height = size.height; }
      return canvas;
    }),
    createDiv: (parent, cls) => {
      const div = parent.ownerDocument.createElement('div');
      div.className = cls;
      parent.appendChild(div);
      return div;
    },
    ownerWindow: (node) => node.ownerDocument?.defaultView ?? window,
    activeDocument: () => document,
  };
}

describe('@atlas-vtt/shared/dice3d outside Obsidian', () => {
  it('lets a page install the DOM host its 3D dice draw with, and restore the one before', async () => {
    // A fresh module graph: no host installed, as on a page that loads only the package.
    vi.resetModules();
    const dice3d = await import('../../../src/shared/dice3d');
    const dom = await import('../../../src/app/host/dom');
    expect(() => dom.getDomHost()).toThrow('DOM host has not been installed');
    const host = pageHost();
    const restore = dice3d.installDomHost(host);
    expect(dom.getDomHost()).toBe(host);
    expect(dom.getDomHost().createCanvas(document, { width: 4, height: 2 })).toMatchObject({ width: 4, height: 2 });
    expect(host.createCanvas).toHaveBeenCalledOnce();
    restore();
    expect(() => dom.getDomHost()).toThrow('DOM host has not been installed');
  });
});
