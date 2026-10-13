import { afterEach, describe, expect, it, vi } from 'vitest';

const notices: Array<{ message: DocumentFragment; timeout: number; hide: ReturnType<typeof vi.fn> }> = [];
vi.mock('obsidian', () => ({
  Notice: class {
    readonly hide = vi.fn();
    constructor(message: DocumentFragment, timeout: number) {
      notices.push({ message, timeout, hide: this.hide });
    }
  },
}));

import { offerGridAlignment } from '../../src/app/services/gridAlignmentNotice';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { StoreApi } from 'zustand';

afterEach(() => {
  notices.length = 0;
});

describe('offerGridAlignment', () => {
  it('says that the map showed no grid and opens the alignment from the notice itself', () => {
    const setGridAlignmentOpen = vi.fn();
    const store = { getState: () => ({ setGridAlignmentOpen }) } as unknown as StoreApi<ViewAtlasState>;

    offerGridAlignment(store);

    const [notice] = notices;
    expect(notice!.message.textContent).toBe('No grid was found on this map, so none is shown. Align the grid');
    expect(notice!.timeout).toBeGreaterThan(5000);
    notice!.message.querySelector('a')!.click();
    expect(setGridAlignmentOpen).toHaveBeenCalledWith(true);
    expect(notice!.hide).toHaveBeenCalled();
  });
});
