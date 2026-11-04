// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: vi.fn(),
}));

import { ImageDisplayService } from '../../src/app/services/ImageDisplayService';

/** A player window: its document and the window-level listeners the overlay uses for Escape. */
function fakePlayerWindow(document: Document): Window {
  return Object.assign(new EventTarget(), { document }) as unknown as Window;
}

describe('ImageDisplayService cleanup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    if (!('revokeObjectURL' in URL)) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: vi.fn(),
      });
    }
  });

  test('removes player window document listeners when closing the image display', async () => {
    const app = { workspace: {} } as any;
    const service = new ImageDisplayService(app);
    const playerDoc = document.implementation.createHTMLDocument('player');
    const playerWindow = fakePlayerWindow(playerDoc);
    const removeSpy = vi.spyOn(playerDoc, 'removeEventListener');
    const removeWindowSpy = vi.spyOn(playerWindow, 'removeEventListener');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    (service as any).createImageDisplay(playerWindow, 'blob:test-image', 'test.png');
    service.closeImageDisplay();

    // Input stops at once; the overlay itself leaves once its exit has played
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    expect(removeWindowSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(playerDoc.querySelector('.atlas-image-display')?.classList.contains('is-leaving')).toBe(true);
    expect(service.isImageDisplayed()).toBe(false);

    await vi.waitFor(() => expect(playerDoc.querySelector('.atlas-image-display')).toBeNull());
    expect(revokeSpy).toHaveBeenCalledWith('blob:test-image');

    revokeSpy.mockRestore();
  });

  test('crossfades a replaced image: the new overlay enters beneath the leaving one', async () => {
    const service = new ImageDisplayService({ workspace: {} } as any);
    const playerDoc = document.implementation.createHTMLDocument('player');
    const playerWindow = fakePlayerWindow(playerDoc);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    (service as any).createImageDisplay(playerWindow, 'blob:first', 'first.png');
    (service as any).createImageDisplay(playerWindow, 'blob:second', 'second.png');

    const overlays = Array.from(playerDoc.querySelectorAll('.atlas-image-display'));
    expect(overlays.map((overlay) => overlay.querySelector('img')?.getAttribute('src'))).toEqual(['blob:second', 'blob:first']);
    expect(overlays[1]?.classList.contains('is-leaving')).toBe(true);

    await vi.waitFor(() => expect(playerDoc.querySelectorAll('.atlas-image-display')).toHaveLength(1));
    expect(service.isImageDisplayed()).toBe(true);
  });

  test('keeps the replaced image until the new one is decoded', async () => {
    const service = new ImageDisplayService({ workspace: {} } as any);
    const playerDoc = document.implementation.createHTMLDocument('player');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let finishDecode: () => void = () => undefined;
    const decode = vi.spyOn(HTMLImageElement.prototype, 'decode');

    (service as any).createImageDisplay(fakePlayerWindow(playerDoc), 'blob:first', 'first.png');
    decode.mockImplementationOnce(() => new Promise<void>((resolve) => { finishDecode = resolve; }));
    (service as any).createImageDisplay(fakePlayerWindow(playerDoc), 'blob:second', 'second.png');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(playerDoc.querySelectorAll('.atlas-image-display')).toHaveLength(2);

    finishDecode();
    await vi.waitFor(() => expect(playerDoc.querySelectorAll('.atlas-image-display')).toHaveLength(1));
  });

  test('removes leaving overlays at once on destroy', () => {
    const service = new ImageDisplayService({ workspace: { offref: vi.fn() } } as any);
    const playerDoc = document.implementation.createHTMLDocument('player');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    (service as any).createImageDisplay(fakePlayerWindow(playerDoc), 'blob:test-image', 'test.png');
    service.closeImageDisplay();
    service.destroy();

    expect(playerDoc.querySelector('.atlas-image-display')).toBeNull();
  });

  test('unregisters workspace menu hooks on destroy', () => {
    const fileMenuRef = { id: 'file-menu' };
    const linkMenuRef = { id: 'link-menu' };
    const editorMenuRef = { id: 'editor-menu' };
    const on = vi
      .fn()
      .mockReturnValueOnce(fileMenuRef)
      .mockReturnValueOnce(linkMenuRef)
      .mockReturnValueOnce(editorMenuRef);
    const offref = vi.fn();
    const app = {
      workspace: { on, offref },
      metadataCache: {},
      vault: {},
    } as any;

    const service = new ImageDisplayService(app);
    service.registerContextMenu();
    service.destroy();

    expect(offref).toHaveBeenCalledWith(fileMenuRef);
    expect(offref).toHaveBeenCalledWith(linkMenuRef);
    expect(offref).toHaveBeenCalledWith(editorMenuRef);
  });
});
