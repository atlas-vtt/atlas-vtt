import '../setup/obsidianDom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cdp } from 'vitest/browser';
import type { Notice } from 'obsidian';
import { animateNotice } from '../../src/app/ui/noticeMotion';

/** Chromium's own answer to `prefers-reduced-motion`, as an operating system with animations switched off gives it. */
async function preferReducedMotion(reduce: boolean): Promise<void> {
  await cdp().send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
}

/** A notice as Obsidian makes it: its element in the notice container, and a `hide` Atlas replaces. */
function showNotice(): { notice: Notice; el: HTMLElement; container: HTMLElement } {
  const container = document.body.createDiv({ cls: 'notice-container' });
  const el = container.createDiv({ cls: 'notice atlas-notice', text: 'Saved' });
  const notice = { containerEl: el, hide: (): void => undefined } as unknown as Notice;
  animateNotice(notice);
  return { notice, el, container };
}

/**
 * Report #703's console error: where the system asks for reduced motion (on
 * Windows, "Animation effects" off), hiding any Atlas notice threw `Cannot read
 * properties of undefined (reading 'animation')`: its exit waited on a fade of
 * two values, of which the transform does not change, and Motion has no
 * animation to wait on for a value that stays. The notice then never left the
 * page. This needs the browser's own animations, which jsdom has none of.
 */
describe('an Atlas notice leaving', () => {
  afterEach(async () => {
    await preferReducedMotion(false);
    document.body.replaceChildren();
  });

  it.each([[true], [false]])('goes without an error and takes its emptied container along (reduced motion: %s)', async (reduce) => {
    await preferReducedMotion(reduce);
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(reduce);
    const { notice, el, container } = showNotice();
    await vi.waitFor(() => expect(getComputedStyle(el).opacity).toBe('1'));

    expect(() => notice.hide()).not.toThrow();
    await vi.waitFor(() => expect(el.isConnected).toBe(false));
    expect(container.isConnected).toBe(false);
  });

  it('goes when it is hidden before it has shown, where reduced motion leaves it nothing to animate', async () => {
    await preferReducedMotion(true);
    const { notice, el } = showNotice();
    expect(() => notice.hide()).not.toThrow();
    await vi.waitFor(() => expect(el.isConnected).toBe(false));
  });
});
