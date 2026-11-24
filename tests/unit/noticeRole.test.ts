// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
  Notice: class {
    containerEl = document.createElement('div');
    constructor(message: string) { this.containerEl.textContent = message; }
    hide(): void {}
  },
}));
vi.mock('../../src/app/ui/noticeMotion', () => ({ animateNotice: () => undefined }));

import { ATLAS_NOTICE_CLASS, showNotice } from '../../src/app/ui/notice';

describe('showNotice', () => {
  it('marks every Atlas notice as a status, so screen readers read it out without taking focus', () => {
    const notice = showNotice('Could not save who sees HP') as unknown as { containerEl: HTMLElement };
    expect(notice.containerEl.classList.contains(ATLAS_NOTICE_CLASS)).toBe(true);
    expect(notice.containerEl.getAttribute('role')).toBe('status');
  });
});
