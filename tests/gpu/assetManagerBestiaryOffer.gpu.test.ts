import '../setup/obsidianDom';
import '../../styles/main.scss';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { BestiaryTokensOffer } from '../../src/app/packages/components/asset-manager/components/BestiaryTokensOffer';
import { Sidebar } from '../../src/app/packages/components/asset-manager/components/Sidebar';
import { AssetService } from '../../src/app/services/AssetService';
import { installBestiaryTokens, type InstallOptions } from '../../src/app/services/stockPacks/bestiaryTokens';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** The Obsidian variables the sidebar's sizes come from, at their default values. */
const OBSIDIAN = `
  body { margin: 0; --input-height: 30px; --font-ui-small: 13px; --font-ui-smaller: 12px; --font-medium: 500; --font-normal: 400;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --font-interface: sans-serif; background: #1e1e1e; color: #dadada;
    --background-secondary: #262626; --interactive-accent: #8a5cf5; --background-primary: #1e1e1e; --background-modifier-border: #363636; --background-modifier-hover: #2a2a2a; --interactive-normal: #2a2a2a; --interactive-accent-hover: #9d75f7; --text-on-accent: #fff; --font-ui-medium: 15px; --text-normal: #dadada; --text-muted: #a3a3a3; --text-faint: #666; --divider-color: #363636; }
  .frame { position: absolute; inset: 0; width: 900px; height: 640px; display: flex; }
`;

const noop = (): void => undefined;

// The download itself is the unit tests'; here it only reports its steps.
vi.mock('../../src/app/services/stockPacks/bestiaryTokens', async (original) => ({
  ...(await original<typeof import('../../src/app/services/stockPacks/bestiaryTokens')>()),
  installBestiaryTokens: vi.fn(),
}));

describe('the bestiary tokens offer', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  const style = document.createElement('style');

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    style.remove();
    AssetService.resetInstance();
  });

  it('stands in the sidebar\'s foot above Manage, inside the sidebar, its text on one line', async () => {
    await page.viewport(1100, 700);
    style.textContent = OBSIDIAN;
    document.head.append(style);
    const { app } = createInMemoryApp();
    await new SettingsService(app).initialize();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    host = document.body.createDiv({ cls: 'atlas-vtt-plugin frame theme-dark' });
    root = createRoot(host);
    await act(async () => {
      root?.render(React.createElement(Sidebar, {
        selectedTagIds: [], onSelectTag: noop, onClearTags: noop, tags: [{ id: 'class', name: 'Class' }], assets: [],
        collections: [{ id: 'Default', uid: 'u', name: 'Default', isDefault: true }], selectedCollection: 'Default', onSelectCollection: noop, onManageTags: noop,
        footer: React.createElement(BestiaryTokensOffer, { app, assets, collection: assets.getDefaultCollectionId(), variant: 'sidebar' }),
      }));
    });
    await expect.poll(() => document.querySelector('.atlas-bestiary-offer')).not.toBeNull();
    const offer = document.querySelector<HTMLElement>('.atlas-bestiary-offer')!;
    const manage = document.querySelector<HTMLElement>('.atlas-asset-manager-manage-btn:not(.atlas-bestiary-offer)')!;
    const sidebar = document.querySelector<HTMLElement>('.atlas-asset-manager-sidebar')!.getBoundingClientRect();
    const box = offer.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(sidebar.left);
    expect(box.right).toBeLessThanOrEqual(sidebar.right);
    expect(box.bottom).toBeLessThanOrEqual(manage.getBoundingClientRect().top);
    expect(manage.getBoundingClientRect().top - box.bottom).toBeLessThanOrEqual(8);
    expect(box.width).toBeCloseTo(manage.getBoundingClientRect().width, 0);
    expect(offer.scrollWidth).toBeLessThanOrEqual(offer.clientWidth + 1);
    expect(offer.textContent).toMatch(/^Get starter tokens\d+ MB$/);
    // The choice opens above the button there, inside the window.
    await act(async () => offer.click());
    const popover = document.querySelector<HTMLElement>('.atlas-starter-choice')!.getBoundingClientRect();
    expect(popover.bottom).toBeLessThanOrEqual(box.top);
    expect(popover.left).toBeGreaterThanOrEqual(0);
    expect(popover.top).toBeGreaterThanOrEqual(0);
    const content = document.querySelector<HTMLElement>('.atlas-asset-manager-sidebar-content')!;
    expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth);
    await page.screenshot({ path: '__screenshots__/asset-manager/bestiary-offer.png', element: host });
  });

  it('stands centred in the empty Tokens tab as its call to action, and takes the press the empty state passes on', async () => {
    await page.viewport(1100, 700);
    style.textContent = OBSIDIAN;
    document.head.append(style);
    const { app } = createInMemoryApp();
    await new SettingsService(app).initialize();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    host = document.body.createDiv({ cls: 'atlas-vtt-plugin frame theme-dark' });
    root = createRoot(host);
    // The empty state as ContentPane draws it, inside the scrolling content it centres in.
    await act(async () => {
      root?.render(React.createElement('div', { className: 'atlas-asset-manager-content', style: { flex: 1, display: 'flex', flexDirection: 'column' } },
        React.createElement('div', { className: 'atlas-empty-state' },
          React.createElement('h3', null, 'No tokens yet'),
          React.createElement(BestiaryTokensOffer, { app, assets, collection: assets.getDefaultCollectionId(), variant: 'empty', fallback: React.createElement('p', { className: 'hint' }, 'Use the + button to add some.') }))));
    });
    await expect.poll(() => document.querySelector('.atlas-bestiary-offer--empty')).not.toBeNull();
    const button = document.querySelector<HTMLElement>('.atlas-bestiary-offer--empty')!;
    const area = document.querySelector<HTMLElement>('.atlas-empty-state')!.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    expect(Math.abs((box.left + box.right) / 2 - (area.left + area.right) / 2)).toBeLessThan(1);
    expect(getComputedStyle(button).pointerEvents).toBe('auto');
    expect(document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2)?.closest('.atlas-bestiary-offer--empty')).toBe(button);
    expect(button.textContent).toBe('Get 155 free tokens');
    expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth + 1);
    // The offer takes the hint's place; no choice stands beside the button until it is pressed.
    expect(document.querySelector('.hint')).toBeNull();
    expect(document.querySelector('.atlas-starter-choice')).toBeNull();
    expect(document.querySelector('.atlas-starter-offer__fine')!.getBoundingClientRect().top).toBeGreaterThanOrEqual(box.bottom + 8);
    await page.screenshot({ path: '__screenshots__/asset-manager/starter-tokens-empty.png', element: host });

    // The press opens the choice under the button, centred on it, the collection's suggestion chosen and focused.
    await act(async () => button.click());
    const popover = document.querySelector<HTMLElement>('.atlas-starter-choice')!;
    const placed = popover.getBoundingClientRect();
    expect(placed.top).toBeGreaterThanOrEqual(box.bottom);
    expect(Math.abs((placed.left + placed.right) / 2 - (box.left + box.right) / 2)).toBeLessThan(1);
    const options = [...popover.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(options.map((option) => option.querySelector('span > span')?.textContent)).toEqual(['Tokens only', '5E', 'Cairn']);
    expect(options[0]!.getAttribute('aria-checked')).toBe('true');
    // No heading: the button said what the choice is for.
    expect(popover.querySelector('.atlas-dropdown-label')).toBeNull();
    await act(async () => options[1]!.click());
    expect(options[1]!.getAttribute('aria-checked')).toBe('true');
    for (const option of options) expect(option.scrollWidth, option.textContent ?? '').toBeLessThanOrEqual(option.clientWidth + 1);
    await page.screenshot({ path: '__screenshots__/asset-manager/starter-tokens-choice.png', element: host });

    // Escape closes it, and only it.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => { document.activeElement?.dispatchEvent(escape); });
    expect(document.querySelector('.atlas-starter-choice')).toBeNull();
    expect(escape.defaultPrevented).toBe(true);

    // Opened from the keyboard, focus goes to the chosen option; opened by a press, it stays put, so no ring shows.
    await act(async () => button.click());
    expect(document.activeElement?.closest('.atlas-starter-choice [role="radio"]')?.getAttribute('aria-checked')).toBe('true');
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); });
    expect(document.querySelector('.atlas-starter-choice')).not.toBeNull();
    expect(document.activeElement?.closest('.atlas-starter-choice')).toBeNull();
  });

  it('keeps the button\u2019s size while it downloads, the bar under it saying how far it got', async () => {
    await page.viewport(1100, 700);
    style.textContent = OBSIDIAN;
    document.head.append(style);
    const { app } = createInMemoryApp();
    await new SettingsService(app).initialize();
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    let step: (share: number) => void = noop;
    vi.mocked(installBestiaryTokens).mockImplementation((_app, _assets, _collection, options: InstallOptions = {}) => {
      step = options.onStep ?? step;
      return new Promise<number>(() => undefined);
    });
    host = document.body.createDiv({ cls: 'atlas-vtt-plugin frame theme-dark' });
    root = createRoot(host);
    await act(async () => {
      root?.render(React.createElement('div', { className: 'atlas-asset-manager-content', style: { flex: 1, display: 'flex', flexDirection: 'column' } },
        React.createElement('div', { className: 'atlas-empty-state' },
          React.createElement('h3', null, 'No tokens yet'),
          React.createElement(BestiaryTokensOffer, { app, assets, collection: assets.getDefaultCollectionId(), variant: 'empty' }))));
    });
    await expect.poll(() => document.querySelector('.atlas-bestiary-offer--empty')).not.toBeNull();
    const button = document.querySelector<HTMLElement>('.atlas-bestiary-offer--empty')!;
    const before = button.getBoundingClientRect();
    await act(async () => button.click());
    await act(async () => document.querySelector<HTMLElement>('.atlas-starter-choice__download')!.click());
    expect(document.querySelector('.atlas-starter-choice')).toBeNull();
    const sizes: string[] = [];
    for (const share of [0, 0.07, 0.42, 0.99]) {
      await act(async () => step(share));
      const now = button.getBoundingClientRect();
      sizes.push(`${now.width}x${now.height}`);
    }
    expect(new Set(sizes)).toEqual(new Set([`${before.width}x${before.height}`]));
    const bar = document.querySelector<HTMLElement>('.atlas-bestiary-offer__progress')!.getBoundingClientRect();
    expect(bar.top).toBeGreaterThanOrEqual(button.getBoundingClientRect().bottom);
    expect(Math.abs(bar.width - before.width)).toBeLessThan(1);
    await page.screenshot({ path: '__screenshots__/asset-manager/starter-tokens-downloading.png', element: host });
  });
});

