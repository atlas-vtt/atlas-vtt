import '../setup/obsidianDom';
import '../../styles/main.scss';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { BestiaryTokensOffer } from '../../src/app/packages/components/asset-manager/components/BestiaryTokensOffer';
import { Sidebar } from '../../src/app/packages/components/asset-manager/components/Sidebar';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** The Obsidian variables the sidebar's sizes come from, at their default values. */
const OBSIDIAN = `
  body { margin: 0; --input-height: 30px; --font-ui-small: 13px; --font-ui-smaller: 12px; --font-medium: 500; --font-normal: 400;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --font-interface: sans-serif; background: #1e1e1e; color: #dadada;
    --background-secondary: #262626; --text-normal: #dadada; --text-muted: #a3a3a3; --text-faint: #666; --divider-color: #363636; }
  .frame { position: absolute; inset: 0; width: 900px; height: 640px; display: flex; }
`;

const noop = (): void => undefined;

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
        footer: React.createElement(BestiaryTokensOffer, { app, assets }),
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
    expect(offer.textContent).toMatch(/^Get bestiary tokens\d+ MB$/);
    await page.screenshot({ path: '__screenshots__/asset-manager/bestiary-offer.png', element: host });
  });
});
