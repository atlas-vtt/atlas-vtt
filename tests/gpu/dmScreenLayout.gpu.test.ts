import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';

/** The DM screen as `DMScreen` renders it, styled by the plugin's real stylesheet. */
const DM_SCREEN = `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-dm-screen-wrapper">
        <div class="atlas-dm-screen-backdrop"></div>
        <div class="atlas-dm-screen">
          <div class="atlas-dm-screen-stage">
            <div class="atlas-dm-screen-content atlas-dm-page" data-page="current">
              <div class="atlas-dm-statblocks-section"><div class="atlas-dm-statblocks-grid"></div></div>
              <div class="atlas-dm-notes-section"><div class="atlas-dm-notes-content"></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

function boxOf(selector: string): DOMRect {
  return document.querySelector(selector)!.getBoundingClientRect();
}

function expectInside(inner: DOMRect, outer: DOMRect): void {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top);
  expect(inner.right).toBeLessThanOrEqual(outer.right);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom);
}

describe('the DM screen beside open sidebars', () => {
  const style = document.createElement('style');
  style.textContent = css;
  // Obsidian's workspace leaf, here pushed right by a sidebar: `contain: strict` makes it
  // the containing block of the DM screen's fixed wrapper.
  const leaf = document.createElement('div');

  async function openIn(window: { width: number; height: number }, pane: { left: number; width: number }): Promise<void> {
    await page.viewport(window.width, window.height);
    leaf.style.cssText = `position: absolute; top: 40px; left: ${pane.left}px; width: ${pane.width}px; height: ${window.height - 80}px; contain: strict`;
  }

  beforeEach(() => {
    document.head.append(style);
    leaf.innerHTML = DM_SCREEN;
    document.body.append(leaf);
  });

  afterEach(() => {
    leaf.remove();
    style.remove();
  });

  it('with pages, keeps the panes one inset from three edges, under the page control centred near the top', async () => {
    await openIn({ width: 2400, height: 1800 }, { left: 0, width: 2400 });
    const screen = document.querySelector<HTMLElement>('.atlas-dm-screen')!;
    screen.classList.add('atlas-dm-screen--pages');
    // As it stands once its entrance has run.
    screen.style.transform = 'translate(-50%, -50%)';
    const header = document.createElement('div');
    header.className = 'atlas-dm-screen-header';
    header.innerHTML = '<div class="atlas-segmented" style="height: 38px; width: 200px"></div>';
    screen.prepend(header);
    const view = leaf.getBoundingClientRect();
    const control = boxOf('.atlas-segmented');
    const statblocks = boxOf('.atlas-dm-statblocks-section');

    const notes = boxOf('.atlas-dm-notes-section');
    const inset = statblocks.left - view.left;

    expect(inset).toBeGreaterThan(30);
    expect(control.top - view.top).toBeCloseTo(16, 0);
    expect((control.left + control.right) / 2).toBeCloseTo((view.left + view.right) / 2, 0);
    expect(view.right - notes.right).toBeCloseTo(inset, 0);
    expect(view.bottom - statblocks.bottom).toBeCloseTo(inset, 0);
    expect(statblocks.top - control.bottom).toBeCloseTo(16, 0);
  });

  it('keeps the panes side by side within a pane narrowed by sidebars', async () => {
    await openIn({ width: 1600, height: 1000 }, { left: 300, width: 1000 });
    const view = leaf.getBoundingClientRect();
    const screen = boxOf('.atlas-dm-screen');
    const statblocks = boxOf('.atlas-dm-statblocks-section');
    const notes = boxOf('.atlas-dm-notes-section');

    expectInside(screen, view);
    expectInside(statblocks, screen);
    expectInside(notes, screen);
    expect(statblocks.right).toBeLessThanOrEqual(notes.left);
  });

  it('stacks the panes once the view, not the window, is narrow', async () => {
    await openIn({ width: 1600, height: 1000 }, { left: 500, width: 700 });
    const screen = boxOf('.atlas-dm-screen');
    const statblocks = boxOf('.atlas-dm-statblocks-section');
    const notes = boxOf('.atlas-dm-notes-section');

    expectInside(screen, leaf.getBoundingClientRect());
    expectInside(notes, screen);
    expect(statblocks.bottom).toBeLessThanOrEqual(notes.top);
    expect(notes.width).toBeCloseTo(statblocks.width, 0);
  });

  it('scales its text by the width of the view', async () => {
    await openIn({ width: 2000, height: 1000 }, { left: 600, width: 1200 });
    const scale = (selector: string): number => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);

    expect(scale('.atlas-dm-screen')).toBe(scale('.atlas-ui'));
  });

  it('rests without a transform, so its text is not composited on half pixels', async () => {
    // A view whose centre lies on a half pixel: a `translate(-50%, -50%)` left the DM screen's layer
    // there after opening, which blurs its text on screens of device pixel ratio 1 (#573).
    await openIn({ width: 1600, height: 1000 }, { left: 300, width: 1051 });
    const screen = document.querySelector<HTMLElement>('.atlas-dm-screen')!;
    screen.classList.add('is-visible');
    await Promise.all(screen.getAnimations().map((animation) => animation.finished));

    expect(getComputedStyle(screen).transform).toBe('none');
    expect(getComputedStyle(screen).opacity).toBe('1');
    const view = leaf.getBoundingClientRect();
    const box = screen.getBoundingClientRect();
    expect(box.left - view.left).toBeCloseTo(view.right - box.right, 1);
    expect(box.top - view.top).toBeCloseTo(view.bottom - box.bottom, 1);
  });
});
