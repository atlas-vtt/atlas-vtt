import '../setup/obsidianDom';
import '../../styles/main.scss';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { Content, type ContentProps } from '../../src/app/packages/components/asset-manager/components/Content';
import { TabSwitcher } from '../../src/app/packages/components/asset-manager/components/TabSwitcher';
import { RevealImage } from '../../src/app/packages/components/primitives/RevealImage';
import type { AnyAsset, Tab } from '../../src/app/packages/components/asset-manager/types';

// Opening an asset and previewing its statblock reach into services that need Node; neither happens here.
vi.mock('../../src/app/packages/components/asset-manager/hooks/useOpenAsset', () => ({
  useOpenAsset: () => (): Promise<void> => Promise.resolve(),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetStatblockPreview', () => ({
  useAssetStatblockPreview: (): void => undefined,
}));
// The cards reach the token link service, which loads Node's events module.
vi.mock('events', async () => import('eventemitter3'));

/** The Obsidian variables the asset manager's sizes and colours come from, at their default values. */
const OBSIDIAN = `
  body { margin: 0; --input-height: 30px; --font-ui-small: 13px; --font-ui-smaller: 12px; --font-ui-medium: 15px; --font-medium: 500;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-interface: sans-serif; --line-height-tight: 1.3;
    --background-primary: #1e1e1e; --background-secondary: #262626; --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #666; }
`;
/** A 2 × 2 px image, so every card's art loads without the network. */
const PIXEL = 'data:image/gif;base64,R0lGODlhAgACAIAAAP///wAAACH5BAAAAAAALAAAAAACAAIAAAIChFEAOw==';
/** Layout rounds to fractions of a pixel. */
const SLACK = 0.5;
const CARDS_COMPARED = 12;

const noop = (): void => undefined;

function assetsOf(tab: Tab, count: number): AnyAsset[] {
  return Array.from({ length: count }, (_, index): AnyAsset => {
    const base = { id: `${tab}-${index}`, name: `Asset ${index}`, thumbnailUrl: PIXEL, folderId: null, modifiedAt: 0 };
    switch (tab) {
      case 'tokens':
      case 'party': return { ...base, type: 'tokens', imageUrl: PIXEL };
      case 'maps': return { ...base, type: 'maps', imageUrl: PIXEL, mapFilePath: 'map.webp' };
      case 'scenes': return { ...base, type: 'scenes' };
      case 'encounters': return { ...base, type: 'encounters', tokens: [], tokenPreviews: [{ url: PIXEL }, { url: PIXEL }, { url: PIXEL }] };
    }
  });
}

function contentProps(tab: Tab, loading: boolean): ContentProps {
  return {
    activeTab: tab,
    assets: loading ? [] : assetsOf(tab, 60),
    folders: [],
    selectedAssetIds: [],
    selectedFolderIds: [],
    selectedFolderId: null,
    folderDepth: 0,
    refinement: '',
    loading,
    showSkeleton: loading,
    assetCount: null,
    onAssetSelect: noop,
    onAssetContextMenu: noop,
    onFolderSelection: noop,
    onFolderContextMenu: noop,
    onFolderDoubleClick: noop,
    onContentContextMenu: noop,
    onClearSelection: noop,
    onClose: noop,
    collapsedSections: { folders: false, assets: false },
    setCollapsedSections: noop,
    draggedItems: null,
    setDraggedItems: noop,
    dropTarget: null,
    setDropTarget: noop,
    onDrop: noop,
    view: null,
    app: new App(),
    assetService: null,
    spawnCounts: {},
    onSpawnCountChange: noop,
    scrollKey: tab,
    scrollMemory: { scrollTopOf: () => 0, setScrollTop: noop },
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Resize observers report between layout and paint. */
async function settled(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

interface Box { left: number; top: number; width: number; height: number }

function boxesOf(host: HTMLElement, selector: string): Box[] {
  return Array.from(host.querySelectorAll<HTMLElement>(selector)).slice(0, CARDS_COMPARED).map((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    return { left, top, width, height };
  });
}

/** The properties every animation running inside `root` changes, pseudo-elements included. */
function animatedProperties(root: Element): string[] {
  const properties = new Set<string>();
  for (const animation of root.getAnimations({ subtree: true })) {
    if (!(animation.effect instanceof KeyframeEffect)) continue;
    for (const keyframe of animation.effect.getKeyframes()) {
      for (const property of Object.keys(keyframe)) {
        if (!['offset', 'computedOffset', 'easing', 'composite'].includes(property)) properties.add(property);
      }
    }
  }
  return [...properties].sort();
}

describe('the asset manager while its content loads', () => {
  const style = document.createElement('style');
  style.textContent = OBSIDIAN;
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    document.head.append(style);
    host = document.createElement('div');
    host.className = 'atlas-vtt-plugin';
    // The body of the manager's window: the panes fill it.
    host.style.cssText = 'position: relative; width: 1000px; height: 640px; background: var(--background-primary)';
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    style.remove();
  });

  it.each<Tab>(['tokens', 'party', 'maps', 'scenes', 'encounters'])('puts the %s where their placeholders stood', async (tab) => {
    flushSync(() => root.render(React.createElement(Content, contentProps(tab, true))));
    await expect.poll(() => boxesOf(host, '.atlas-content-skeleton .atlas-asset-card').length).toBe(CARDS_COMPARED);
    const skeletonCards = boxesOf(host, '.atlas-content-skeleton .atlas-asset-card');
    const skeletonHeader = boxesOf(host, '.atlas-content-skeleton .atlas-section-header');
    expect(skeletonCards).toHaveLength(CARDS_COMPARED);

    flushSync(() => root.render(React.createElement(Content, contentProps(tab, false))));
    // The pane with the content fades in over the placeholders' pane, which then leaves.
    await expect.poll(() => host.querySelector('.atlas-content-skeleton')).toBeNull();
    await expect.poll(() => boxesOf(host, '.atlas-asset-grid-virtual .atlas-asset-card').length).toBe(CARDS_COMPARED);
    await settled();
    const cards = boxesOf(host, '.atlas-asset-grid-virtual .atlas-asset-card');
    const header = boxesOf(host, '.atlas-content-sections .atlas-section-header');

    expect(cards).toHaveLength(CARDS_COMPARED);
    for (const [index, card] of cards.entries()) {
      const placeholder = skeletonCards[index]!;
      for (const side of ['left', 'top', 'width', 'height'] as const) {
        expect(Math.abs(card[side] - placeholder[side]), `card ${index} ${side}: ${card[side]} was ${placeholder[side]}`).toBeLessThanOrEqual(SLACK);
      }
    }
    expect(Math.abs(header[0]!.top - skeletonHeader[0]!.top)).toBeLessThanOrEqual(SLACK);
    expect(Math.abs(header[0]!.height - skeletonHeader[0]!.height)).toBeLessThanOrEqual(SLACK);
  });

  it('keeps only the rows around the view mounted while it scrolls', async () => {
    flushSync(() => root.render(React.createElement(Content, { ...contentProps('tokens', false), assets: assetsOf('tokens', 600) })));
    await expect.poll(() => host.querySelectorAll('.atlas-asset-card').length).toBeGreaterThan(CARDS_COMPARED);
    await settled();
    const pane = host.querySelector<HTMLElement>('.atlas-asset-manager-content')!;
    const atRest = pane.querySelectorAll('.atlas-asset-card').length;

    let most = 0;
    for (let step = 0; step < 80; step++) {
      pane.scrollTop += 90;
      await nextFrame();
      most = Math.max(most, pane.querySelectorAll('.atlas-asset-card').length);
    }

    // Rows above the view join those below it; cards scrolled past must not stay mounted.
    expect(most).toBeLessThanOrEqual(atRest * 2);
  });

  it('shows placeholders in the rows that are not mounted, where their cards will be', async () => {
    flushSync(() => root.render(React.createElement(Content, { ...contentProps('tokens', false), assets: assetsOf('tokens', 600) })));
    await expect.poll(() => host.querySelector('.atlas-asset-grid-rest')).not.toBeNull();
    // A measured card gives the rows their height one render later.
    await settled();
    await settled();
    const pane = host.querySelector<HTMLElement>('.atlas-asset-manager-content')!;
    const grid = host.querySelector<HTMLElement>('.atlas-asset-grid-virtual')!;
    const rest = host.querySelector<HTMLElement>('.atlas-asset-grid-rest')!;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.atlas-asset-card'));
    const lowest = Math.max(...cards.map((card) => card.getBoundingClientRect().bottom));
    const gap = parseFloat(getComputedStyle(grid).columnGap);

    // The placeholders begin one gap below the last mounted row, and animate nothing.
    expect(Math.abs(rest.getBoundingClientRect().top - (lowest + gap))).toBeLessThanOrEqual(SLACK);
    expect(getComputedStyle(rest).animationName).toBe('none');

    // The first placeholder's art is drawn where the art of the card that follows the mounted ones will be.
    const tile = decodeURIComponent(getComputedStyle(rest).maskImage);
    const [, cx, cy, radius] = /<circle cx='([\d.]+)' cy='([\d.]+)' r='([\d.]+)'/.exec(tile)!.map(Number);
    const drawn = { left: rest.getBoundingClientRect().left + cx! - radius!, top: rest.getBoundingClientRect().top + cy! - radius!, size: radius! * 2 };
    const before = pane.scrollTop;
    pane.scrollTop += 600;
    await expect.poll(() => grid.querySelector(`[data-asset-id="tokens-${cards.length}"]`)).not.toBeNull();
    const art = grid.querySelector(`[data-asset-id="tokens-${cards.length}"] .atlas-asset-card-thumb`)!.getBoundingClientRect();
    const scrolled = pane.scrollTop - before;

    expect(Math.abs(art.left - drawn.left)).toBeLessThanOrEqual(SLACK);
    expect(Math.abs(art.top + scrolled - drawn.top)).toBeLessThanOrEqual(SLACK);
    expect(Math.abs(art.width - drawn.size)).toBeLessThanOrEqual(SLACK);
  });

  it('fills the pane with placeholders and no further, when the number of assets is not known', async () => {
    flushSync(() => root.render(React.createElement(Content, contentProps('tokens', true))));
    await settled();
    const pane = host.querySelector<HTMLElement>('.atlas-content-skeleton')!;
    await expect.poll(() => pane.querySelectorAll('.atlas-asset-card').length).toBeGreaterThan(1);
    const cards = Array.from(pane.querySelectorAll<HTMLElement>('.atlas-asset-card'));
    const bottom = pane.getBoundingClientRect().bottom;
    const tops = [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top)))];

    // The last row reaches the pane's lower edge; no row lies wholly below it.
    expect(Math.max(...cards.map((card) => card.getBoundingClientRect().bottom))).toBeGreaterThanOrEqual(bottom);
    expect(Math.max(...tops)).toBeLessThan(bottom);
    expect(pane.scrollHeight - pane.clientHeight).toBeLessThan(cards[0]!.offsetHeight + 16);
  });

  it('shows as many placeholders as the tab holds, when that is known', async () => {
    flushSync(() => root.render(React.createElement(Content, { ...contentProps('tokens', true), assetCount: 4 })));
    await settled();
    expect(host.querySelectorAll('.atlas-content-skeleton .atlas-asset-card')).toHaveLength(4);
  });

  it('moves its placeholders with transforms and opacity only, so they never wait for the main thread', async () => {
    flushSync(() => root.render(React.createElement(Content, contentProps('maps', true))));
    await settled();
    const pane = host.querySelector('.atlas-content-skeleton')!;
    expect(getComputedStyle(pane, '::after').animationName).toBe('atlas-skeleton-sweep');
    expect(animatedProperties(host)).toEqual(['opacity', 'transform']);
  });

  it('shows an image it has shown before at once, and holds the place of a new one', async () => {
    const show = (src: string): void => flushSync(() => root.render(React.createElement('div', { style: { position: 'relative', width: 96, height: 96 } },
      React.createElement(RevealImage, { key: src + Math.random(), src, alt: '' }))));
    const first = `${PIXEL}#first`;

    show(first);
    expect(host.querySelector('.atlas-image-placeholder')).not.toBeNull();
    await expect.poll(() => host.querySelector('img')?.hasAttribute('data-shown')).toBe(true);
    expect(getComputedStyle(host.querySelector('.atlas-image-placeholder')!).animationName).toBe('none');

    // Scrolled away and back: a new element for the same image.
    show(first);
    expect(host.querySelector('img')?.hasAttribute('data-shown')).toBe(true);
    expect(host.querySelector('.atlas-image-placeholder')).toBeNull();
  });

  it('keeps the tabs where they are when their counts arrive', async () => {
    host.style.width = '1400px';
    const widthWith = async (assetCounts: Record<Tab, number> | null): Promise<number[]> => {
      flushSync(() => root.render(React.createElement('div', { className: 'atlas-asset-manager-header' },
        React.createElement(TabSwitcher, { activeTab: 'tokens', onTabChange: noop, assetCounts }))));
      await expect.poll(() => host.querySelectorAll('.atlas-tab-button').length).toBe(5);
      await settled();
      return Array.from(host.querySelectorAll<HTMLElement>('.atlas-tab-button')).map((tab) => tab.getBoundingClientRect().width);
    };

    const counting = await widthWith(null);
    const counted = await widthWith({ scenes: 12, maps: 34, encounters: 5, tokens: 87, party: 4 });

    expect(counting).toHaveLength(5);
    counting.forEach((width, index) => expect(Math.abs(width - counted[index]!)).toBeLessThanOrEqual(SLACK));
  });
});
