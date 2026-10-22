// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { TokenResizeUI } from '../../src/app/pixi/TokenResizeUI';

/**
 * TokenRenderer's store subscriber skips the real size update while a
 * temporary size exists, so the final commit must happen after temps clear.
 */
describe('TokenResizeUI commit ordering', () => {
  it('clears temporary sizes before committing final sizes to the store', () => {
    const viewport = { on: vi.fn(), off: vi.fn(), toWorld: vi.fn(), cursor: '' } as any;
    let ui: TokenResizeUI;
    const updateTokens = vi.fn(() => {
      expect(ui.getTemporarySize('t1')).toBeUndefined();
    });
    const store = {
      getState: () => ({ selectedIds: ['t1'], objects: { tokens: { t1: { id: 't1', size: 1 } } }, updateTokens }),
    } as any;

    vi.spyOn(TokenResizeUI.prototype as any, 'initializeTextures').mockResolvedValue(undefined);
    ui = new TokenResizeUI(viewport, store);
    Object.assign(ui, {
      isResizing: true,
      hasResized: true,
      resizingTokenIds: ['t1'],
      startSizes: { t1: 1 },
      temporarySizes: { t1: 2 },
    });

    (ui as any).onResizeEnd({} as any);

    expect(updateTokens).toHaveBeenCalledWith([{ id: 't1', changes: { size: 2 } }]);
    ui.destroy();
  });
});
