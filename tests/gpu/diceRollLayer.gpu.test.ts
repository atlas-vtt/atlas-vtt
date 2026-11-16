import { createElement, type ReactElement } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { useMapRollLayer } from '../../src/app/react/components/dice/useMapRollLayer';
import { portalHost, releasePortalHosts } from '../../src/app/host/portalHost';

/**
 * The map UI as `UIRoot` lays it out, reduced to what decides the stacking:
 * the top bar row with the mark the dice rolls are placed by at its right end,
 * and the DM screen over the whole view. Styled by the plugin's real stylesheet.
 */
const MAP_UI = `
  <div class="atlas-vtt-plugin atlas-react-ui-container" style="position: absolute; inset: 0; z-index: 1000">
    <div class="atlas-ui" style="position: relative; width: 100%; height: 100%">
      <div class="atlas-top-bar-row">
        <div class="atlas-scene-tab-bar" style="width: 200px; height: 39px; pointer-events: auto"></div>
        <div class="atlas-top-bar-end">
          <div class="atlas-widget-bar" style="width: 120px; height: 44px"></div>
          <div class="dice-mount" style="display: contents"></div>
        </div>
      </div>
      <div class="atlas-dm-screen-wrapper"><div class="atlas-dm-screen-backdrop" style="pointer-events: auto"></div></div>
    </div>
  </div>
`;

/** The asset manager as `GlobalAssetManagerService` mounts it into the portal host: backdrop (blurred) and window. */
const ASSET_MANAGER = `
  <div class="atlas-asset-manager-modal atlas-vtt-plugin atlas-vtt-root">
    <div class="atlas-asset-manager-backdrop"></div>
    <div class="atlas-asset-manager-window"><div class="atlas-asset-manager-container"></div></div>
  </div>
`;

/** The map's rolls as `DiceRollDisplay` renders them: the mark in the view, the column in the portal host. */
function MapRolls(): ReactElement {
  const layer = useMapRollLayer();
  const column = createElement('div', {
    className: `atlas-dice-rolls atlas-vtt-plugin atlas-dice-rolls--front${layer.shown ? '' : ' atlas-dice-rolls--away'}`,
    style: layer.style,
  }, createElement('div', { className: 'atlas-dice-roll' }, createElement('div', { className: 'atlas-dice-roll__sheet', style: { height: 200 } })));
  return createElement('div', { style: { display: 'contents' } }, layer.anchor, createPortal(column, portalHost()));
}

function boxOf(selector: string): DOMRect {
  return document.querySelector(selector)!.getBoundingClientRect();
}

/** The element drawn on top at the middle of `selector`'s box. */
function onTopOf(selector: string): Element | null {
  const box = boxOf(selector);
  return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
}

/** Whether a backdrop filter applies to `element`: one of its own or of an ancestor's layer. */
function blurredByAncestor(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (getComputedStyle(node).backdropFilter !== 'none') return true;
  }
  return false;
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

describe('the layer of the dice rolls', () => {
  const style = document.createElement('style');
  style.textContent = css;
  // Obsidian's workspace leaf: it holds the view's fixed elements and their stacking.
  const leaf = document.createElement('div');
  leaf.style.cssText = 'position: relative; width: 900px; height: 600px; margin: 40px 0 0 60px; contain: strict';
  let root: Root;

  beforeEach(async () => {
    // Room for the whole leaf: nothing is on top of a point outside the viewport.
    await page.viewport(1000, 700);
    document.head.append(style);
    leaf.innerHTML = MAP_UI;
    document.body.append(leaf);
    root = createRoot(leaf.querySelector('.dice-mount')!);
    flushSync(() => root.render(createElement(MapRolls)));
    await frame();
  });

  afterEach(() => {
    root.unmount();
    releasePortalHosts();
    leaf.remove();
    leaf.style.display = '';
    style.remove();
  });

  it('shows a roll above the DM screen and the widgets, and the scene tabs below the DM screen', () => {
    expect(onTopOf('.atlas-dice-roll__sheet')?.className).toBe('atlas-dice-roll__sheet');
    expect(onTopOf('.atlas-scene-tab-bar')?.className).toBe('atlas-dm-screen-backdrop');
    expect(onTopOf('.atlas-widget-bar')?.className).toBe('atlas-dice-roll__sheet');
  });

  it('keeps the bars in the corners of the view and lays the rolls in the top right corner, over the widgets', () => {
    const view = leaf.getBoundingClientRect();
    const inset = 8;
    expect(boxOf('.atlas-scene-tab-bar').left).toBe(view.left + inset);
    expect(boxOf('.atlas-scene-tab-bar').top).toBe(view.top + inset);
    expect(boxOf('.atlas-widget-bar').right).toBe(view.right - inset);
    expect(boxOf('.atlas-widget-bar').top).toBe(view.top + inset);
    expect(boxOf('.atlas-dice-rolls').right).toBe(view.right - inset);
    expect(boxOf('.atlas-dice-rolls').top).toBe(view.top + inset);
  });

  it('shows a roll in front of the open asset manager and a statblock preview over it, unblurred', () => {
    const host = portalHost();
    const manager = host.createDiv({ cls: 'atlas-vtt-plugin atlas-global-asset-manager-container' });
    manager.innerHTML = ASSET_MANAGER;
    // A Cmd+hover preview opened from the asset manager, lying over the roll's corner.
    const roll = boxOf('.atlas-dice-roll__sheet');
    const preview = host.createDiv({ cls: 'atlas-statblock-preview-window atlas-statblock-preview-window--over-modal' });
    preview.style.cssText = `position: fixed; left: ${roll.left - 100}px; top: ${roll.top + 20}px; width: 300px; height: 300px`;

    const column = document.querySelector<HTMLElement>('.atlas-dice-rolls')!;
    column.style.visibility = 'hidden';
    // Without the roll, the asset manager and the preview cover the roll's place.
    expect(onTopOf('.atlas-dice-roll__sheet')?.closest('.atlas-asset-manager-modal, .atlas-statblock-preview-window')).not.toBeNull();
    column.style.visibility = '';
    expect(onTopOf('.atlas-dice-roll__sheet')?.className).toBe('atlas-dice-roll__sheet');
    expect(blurredByAncestor(document.querySelector('.atlas-dice-roll__sheet')!)).toBe(false);
    // Still where it stood in the view.
    expect(boxOf('.atlas-dice-rolls').right).toBe(leaf.getBoundingClientRect().right - 8);
  });

  it('follows the view as it moves, and hides with it behind another tab', async () => {
    leaf.style.marginLeft = '20px';
    await frame();
    expect(boxOf('.atlas-dice-rolls').right).toBe(leaf.getBoundingClientRect().right - 8);

    leaf.style.display = 'none';
    await frame();
    expect(document.querySelector('.atlas-dice-rolls')!.classList.contains('atlas-dice-rolls--away')).toBe(true);
    expect(boxOf('.atlas-dice-rolls').width).toBe(0);

    leaf.style.display = '';
    await frame();
    expect(document.querySelector('.atlas-dice-rolls')!.classList.contains('atlas-dice-rolls--away')).toBe(false);
    expect(onTopOf('.atlas-dice-roll__sheet')?.className).toBe('atlas-dice-roll__sheet');
  });
});
