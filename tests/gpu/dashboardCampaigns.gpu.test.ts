import '../setup/obsidianDom';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import type { StoredCampaign } from '../../src/app/campaigns/campaignTypes';
import { AssetService } from '../../src/app/services/AssetService';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { memoryPresets } from '../mocks/memoryPresets';
import { DASHBOARD_THEME as THEME } from './dashboardTheme';
import { DAY, mountDashboard, paintedMap, query, queryAll, settle, shot } from './dashboardHarness';

// The campaign's game system dialog can delete a preset, which reaches the map views' services.
vi.mock('events', async () => import('eventemitter3'));
// A map's sharp picture comes from its tile pyramid; here it is the painted picture itself.
vi.mock('../../src/app/react/components/dashboard/mapPicture', () => ({
  mapPictureUrl: (app: App, path: string): Promise<string | null> => {
    const file = app.vault.getFileByPath(path);
    return Promise.resolve(file ? app.vault.getResourcePath(file) : null);
  },
  releaseMapPictures: (): void => undefined,
}));

/**
 * The dashboard with campaigns, laid out by the plugin's stylesheet over Obsidian's default theme
 * variables (light and dark). Each test also saves a screenshot beside it, in `__screenshots__`, for a look by eye.
 */

/** Cut-out art, as tokens without a ring have: a figure on a transparent ground. */
function cutOut(hue: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.fillStyle = `hsl(${hue}, 45%, 50%)`;
  context.beginPath();
  context.ellipse(48, 30, 18, 20, 0, 0, Math.PI * 2);
  context.ellipse(48, 82, 32, 30, 0, Math.PI, Math.PI * 2);
  context.fill();
  return canvas.toDataURL();
}

const PARTY = [
  { name: 'Aria', art: 'art/aria.webp', picture: paintedMap(10, 96, 96), ring: true },
  { name: 'Finn', art: 'art/finn.webp', picture: paintedMap(130, 96, 96), ring: true },
  { name: 'Tamsin', art: 'art/tamsin.webp', picture: paintedMap(250, 96, 96), ring: true },
  { name: 'Brom', art: 'art/brom.webp', picture: cutOut(40), ring: false },
  { name: 'Wren', art: 'art/wren.webp', picture: cutOut(300), ring: false },
];

/** The cave scene is the world map of the first campaign, which is played; the others have none. */
function campaignsOf({ scenes }: { scenes: Map<string, string> }): StoredCampaign[] {
  const now = Date.now();
  return [
    { id: 'a', name: 'Rise of the Blood Olms', createdAt: now - 30 * DAY, lastPlayed: now - 2 * DAY, worldMap: scenes.get('Blue Mouth Caves')!, lastScene: scenes.get('Blue Mouth Caves')! },
    { id: 'b', name: 'The Witherwild', createdAt: now - 12 * DAY, lastPlayed: now - 9 * DAY },
    { id: 'c', name: 'Dolmenwood', createdAt: now - 3 * 60 * 60 * 1000 },
  ];
}

const loaded = async (): Promise<void> => {
  await expect.poll(() => queryAll('.scene-grid .scene-card').length).toBe(2);
  await expect.poll(() => (query('.continue-hero__art .atlas-map-art__sharp') as HTMLImageElement | null)?.naturalWidth ?? 0).toBeGreaterThan(0);
};

const box = (element: Element): DOMRect => element.getBoundingClientRect();

describe('the dashboard', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(() => {
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    AssetService.resetInstance();
    vi.restoreAllMocks();
  });

  for (const theme of ['dark', 'light'] as const) {
    for (const size of [{ width: 1600, height: 1000 }, { width: 800, height: 1000 }]) {
      it(`leads with the scene to continue, then campaigns and recent scenes as cards with their art (${theme}, ${size.width})`, async () => {
        await mountDashboard(theme, campaignsOf, { party: PARTY, size });
        await loaded();
        await expect.poll(() => queryAll('.campaign-card .campaign-face').length).toBe(5);

        // The hero is as wide as the page's content and continues the last scene.
        const hero = box(query('.continue-hero'));
        const grid = box(query('.campaign-grid'));
        expect(hero.width).toBeCloseTo(grid.width, 0);
        expect(query('.continue-hero__title').textContent).toBe('Blue Mouth Caves');
        // Its map is the scene's own picture, faded out towards the text from inside the picture:
        // no box edge where the fade begins, and the picture reaches the card's border on every side.
        const heroBox = query('.continue-hero');
        const inner = { left: box(heroBox).left + heroBox.clientLeft, right: box(heroBox).left + heroBox.clientLeft + heroBox.clientWidth };
        const artBox = box(query('.continue-hero__art'));
        const picture = box(query('.continue-hero__art .atlas-map-art__sharp'));
        const mask = getComputedStyle(query('.continue-hero__art')).maskImage;
        if (size.width > 1000) {
          expect(artBox.left).toBeCloseTo(inner.left, 0);
          expect(mask).toMatch(/^linear-gradient\(to right, rgba\(0, 0, 0, 0\) 0%, rgba\(0, 0, 0, 0\) 28%/);
        }
        expect(artBox.right).toBeCloseTo(inner.right, 0);
        expect(picture.right).toBeGreaterThanOrEqual(inner.right);
        expect(picture.left).toBeLessThanOrEqual(artBox.left);
        // The card clips the picture to its own corners.
        expect(getComputedStyle(heroBox).overflow).toBe('hidden');

        // Campaign cards: one height in a row, their art 16:9, the world map's picture where there is one.
        const cards = queryAll('.campaign-grid .campaign-card:not(.campaign-card--new)');
        expect(cards.map((card) => card.querySelector('.dashboard-card__title')?.textContent)).toEqual(['Rise of the Blood Olms', 'The Witherwild', 'Dolmenwood']);
        const art = box(cards[0]!.querySelector('.dashboard-card__art')!);
        expect(art.width / art.height).toBeCloseTo(16 / 9, 1);
        expect(cards[0]!.querySelector('img')).not.toBeNull();
        expect(cards[1]!.querySelector('.campaign-emblem')).not.toBeNull();
        const firstRow = cards.filter((card) => Math.abs(box(card).top - box(cards[0]!).top) < 1);
        for (const card of firstRow) expect(box(card).height).toBeCloseTo(box(cards[0]!).height, 0);
        // The new campaign card stands in the grid like the others.
        expect(query('.campaign-card--new').textContent).toBe('New campaign');

        // Recent scenes leave out the one the hero continues.
        expect(queryAll('.scene-card .dashboard-card__title').map((title) => title.textContent)).not.toContain('Blue Mouth Caves');
        // Nothing runs past the pane.
        expect(document.querySelector('.atlas-dashboard-view')!.scrollWidth).toBeLessThanOrEqual(size.width);
        await settle();
        await shot(`home-${theme}-${size.width}`);
      });
    }

    it(`shows the campaign played on this device, and a card's hover and press (${theme})`, async () => {
      const mounted = await mountDashboard(theme, campaignsOf, { size: { width: 1280, height: 860 } });
      await loaded();
      // Its online table is open.
      act(() => CampaignPlay.forApp(mounted.app).play('a'));
      await expect.poll(() => document.querySelector('.campaign-card .campaign-playing')).not.toBeNull();
      expect(mounted.storage.current()).toHaveLength(3);

      const card = query('.campaign-card');
      const offset = (): number => card.getBoundingClientRect().top - query('.campaign-grid').getBoundingClientRect().top;
      const resting = { top: offset(), border: getComputedStyle(card).borderTopColor };
      await page.elementLocator(card).hover();
      await settle(700);
      // A card is highlighted on hover and never lifts.
      expect(getComputedStyle(card).transform).toBe('none');
      expect(offset()).toBe(resting.top);
      expect(getComputedStyle(card).borderTopColor).not.toBe(resting.border);
      await shot(`home-hover-${theme}`, query('.campaign-grid'));
      fireEvent.click(query('.campaign-card'));
      await expect.poll(() => document.querySelector('.campaign-hero__playing .campaign-playing')).not.toBeNull();
      act(() => CampaignPlay.forApp(mounted.app).stop());
    });
  }

  it('makes the first campaign from the card at the grid\'s end, saying what is wrong with its name', async () => {
    await mountDashboard('dark', () => [], { scenes: false });
    await expect.poll(() => document.querySelector('.continue-hero--empty')).not.toBeNull();
    expect(document.querySelector('.scene-grid')).toBeNull();
    await settle();
    await shot('empty-dark');
    fireEvent.click(query('.campaign-card--new'));
    const input = query('.campaign-new__input') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    await expect.poll(() => document.querySelector('.campaign-field-error')?.textContent).toBe('Enter a name');
    await shot('new-dark', query('.campaign-grid'));
  });

  it('shows the hero and the cards in their own shapes while they load', async () => {
    let finish: () => void = () => undefined;
    const collections = AssetService.prototype.getCollections;
    vi.spyOn(AssetService.prototype, 'getCollections').mockImplementation(function (this: AssetService) {
      return new Promise((resolve) => { finish = () => resolve(collections.call(this)); });
    });
    await mountDashboard('dark', campaignsOf, { campaignsLoading: true });
    await expect.poll(() => document.querySelector('.continue-hero--loading')).not.toBeNull();
    const skeletons = queryAll('.campaign-grid .campaign-card');
    expect(skeletons).toHaveLength(3);
    expect(query('.campaign-grid').getAttribute('role')).toBe('status');
    await settle(600);
    await shot('loading-dark');
    const placeholder = box(skeletons[0]!.querySelector('.dashboard-card__art')!);
    expect(placeholder.width / placeholder.height).toBeCloseTo(16 / 9, 1);
    finish();
  });

  it('offers a search from five campaigns on, laid out at the control height', async () => {
    const now = Date.now();
    await mountDashboard('dark', () => ['Cairn', 'Dolmenwood', 'The Witherwild', 'Shadowdark', 'Mörk Borg'].map((name, index) => ({ id: `c${index}`, name, createdAt: now - index * DAY })));
    await loaded();
    const field = box(query('.dashboard-section__search .atlas-asset-manager-search'));
    expect(field.height).toBeCloseTo(30, 0);
    fireEvent.change(query('.dashboard-section__search input'), { target: { value: 'wither' } });
    await expect.poll(() => queryAll('.campaign-grid .campaign-card:not(.campaign-card--new)').length).toBe(1);
    await shot('search-dark', query('.dashboard-section'));
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`names the game system on the card and the page, and opens its settings from the page (${theme})`, async () => {
      vi.spyOn(SystemPresetFiles, 'forApp').mockReturnValue(memoryPresets() as unknown as SystemPresetFiles);
      const system = { systemPresetId: 'builtin:cairn', gridDefaults: { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, conditions: [], dice: { defaultRoll: '1d12', crit: 'roll-under' } };
      await mountDashboard(theme, (ids) => campaignsOf(ids).map((campaign) => (campaign.id === 'a' ? { ...campaign, system } : campaign)));
      await loaded();
      expect(query('.campaign-card .dashboard-card__system').textContent).toBe('Cairn');
      fireEvent.click(query('.campaign-card'));
      await expect.poll(() => document.querySelector('.campaign-system__trigger')).not.toBeNull();
      expect(query('.campaign-hero__system').textContent).toBe('Cairn');
      expect(query('.campaign-system__trigger').textContent).toContain('Edited');
      // The system's button spans the side column, as the world map card does.
      expect(box(query('.campaign-system__trigger')).width).toBeCloseTo(box(query('.world-map-card__frame')).width, 0);

      fireEvent.click(query('.campaign-system__trigger'));
      await expect.poll(() => document.querySelector('.atlas-collection-settings-modal [role="radio"][aria-checked="true"]')).not.toBeNull();
      await settle(300);
      const modal = query('.atlas-collection-settings-modal');
      const tabs = [...modal.querySelectorAll('.atlas-collection-settings-tab')].map((tab) => tab.textContent);
      expect(tabs).toEqual(['Game System', 'Dice', 'Grid & Measure', 'Vision', 'Conditions', 'Resources', 'Initiative']);
      // The campaign's rules open fullscreen, as a collection's settings do: the window less the overlay's margin
      const window = box(modal);
      expect(window.left).toBeCloseTo(32, 0);
      expect(window.top).toBeCloseTo(32, 0);
      expect(document.documentElement.clientWidth - window.right).toBeCloseTo(32, 0);
      expect(document.documentElement.clientHeight - window.bottom).toBeCloseTo(32, 0);
      // A form keeps a readable width, centred; the campaign's Resources tab has no recovery pane
      const content = box(query('.atlas-collection-settings-content'));
      const form = box(query('.atlas-collection-settings-page'));
      expect(form.width).toBeLessThanOrEqual(760);
      expect(form.left - content.left).toBeCloseTo(content.right - form.right, -1);
      fireEvent.click([...modal.querySelectorAll('.atlas-collection-settings-tab')].find((tab) => tab.textContent === 'Resources')!);
      expect(modal.querySelector('.atlas-csm-token-stage')).not.toBeNull();
      expect(modal.querySelector('.atlas-rc-pane')).toBeNull();
      await page.screenshot({ path: `__screenshots__/atlas-dashboard-system-dialog-${theme}.png`, element: modal });
    });
  }

  it('shows changes made elsewhere on the page at once', async () => {
    const { storage } = await mountDashboard('dark', campaignsOf);
    await loaded();
    fireEvent.click(query('.campaign-card'));
    await expect.poll(() => document.querySelector('.campaign-page')).not.toBeNull();
    act(() => storage.update('a', (entry) => ({ ...entry, description: 'Blue Mouth Caves, below the Hollow Oak.' })));
    expect((query('.campaign-description__input') as HTMLTextAreaElement).value).toBe('Blue Mouth Caves, below the Hollow Oak.');
  });
});
