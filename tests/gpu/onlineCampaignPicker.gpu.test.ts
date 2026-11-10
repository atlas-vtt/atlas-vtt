import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import type { CampaignChoice } from '../../src/app/online/gm/campaignChoices';
import { campaignPick } from '../../src/app/online/gm/dock/campaignPicker';
import { renderMenu, type MenuActions } from '../../src/app/online/gm/dock/ConnectionMenu';
import { menuModel, type OnlineSnapshot } from '../../src/app/online/gm/dock/panelModel';
import { DASHBOARD_THEME as THEME } from './dashboardTheme';
import { paintedMap } from './dashboardHarness';

vi.mock('events', async () => import('eventemitter3'));

/**
 * The start menu's campaign step, laid out by the plugin's stylesheet over Obsidian's default theme
 * variables (light and dark); each run saves a screenshot in `__screenshots__` for a look by eye.
 */

const MARA = { id: 'acc_mara', handle: 'mara', name: 'Mara' };
const SNAPSHOT: OnlineSnapshot = { status: 'idle', link: null, campaignId: null, sharedLeaf: null, sharedName: null, sharedTokens: {}, players: [], playerTokens: [], seats: null, gate: null, rests: [], cardOrder: [] };
const CHOICES: CampaignChoice[] = [
  { id: 'a', name: 'Rise of the Blood Olms', activity: 'Played 2d ago', players: 4, art: paintedMap(30, 320, 200), hue: 30, playing: true },
  { id: 'b', name: 'The Witherwild, a campaign with a very long name indeed', activity: 'Played 9d ago', players: 1, art: paintedMap(140, 320, 200), hue: 140, playing: false },
  { id: 'c', name: 'Dolmenwood', activity: 'Created 3h ago', players: 0, art: null, hue: 260, playing: false },
];

const actions = (): MenuActions => ({
  start: vi.fn(), choose: vi.fn(), search: vi.fn(), openCampaigns: vi.fn(), signIn: vi.fn(), cancelSignIn: vi.fn(), reopenSignIn: vi.fn(), signOut: vi.fn(), retry: vi.fn(), openAccountPage: vi.fn(), update: vi.fn(),
  newCode: vi.fn(), setRequireCode: vi.fn(), setAskToJoin: vi.fn(), copyCode: () => Promise.resolve(true), hideImage: vi.fn(), addPlayer: vi.fn(), newLink: vi.fn(),
  stop: vi.fn(), share: vi.fn(), copy: () => Promise.resolve(true), toggleQr: vi.fn(),
});

const MANY: CampaignChoice[] = [...CHOICES, ...['Tomb of Annihilation', 'Curse of Strahd', 'The Waking of Willowby Hall', 'Sunless Citadel', 'Barrowmaze'].map((name, index) => ({
  id: `m${index}`, name, activity: `Played ${index + 2}w ago`, players: index, art: index % 2 === 0 ? paintedMap(60 * index, 320, 200) : null, hue: 60 * index, playing: false,
}))];

function mount(theme: 'dark' | 'light', list: readonly CampaignChoice[], picked: string | null = null, query = ''): HTMLElement {
  document.body.className = `theme-${theme}`;
  const plugin = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  plugin.style.cssText = 'position: absolute; inset: 0; padding: 40px; background: var(--background-primary);';
  const dock = plugin.createDiv({ cls: 'atlas-online-dock' });
  dock.style.cssText = 'position: relative; width: 300px; height: auto; border: none; box-shadow: none; background: none;';
  const surface = dock.createDiv({ cls: 'atlas-online-surface' });
  surface.style.cssText = 'position: static; width: 300px;';
  const layer = surface.createDiv({ cls: 'atlas-online-layer', attr: { id: 'surface' } });
  renderMenu(layer, menuModel(SNAPSHOT, { isShared: true, tokens: {}, selected: [] }, { kind: 'can-host', account: MARA, access: { plan: 'beta', maxPlayers: 12, endsAt: null } }, false, campaignPick(list, picked, query)), actions());
  return surface;
}

describe('the start menu\'s campaign step', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => {
    style.remove();
    document.body.empty();
  });

  for (const theme of ['dark', 'light'] as const) {
    it(`fits each campaign in its row, the long name cut, in the ${theme} theme`, async () => {
      const surface = mount(theme, CHOICES, 'b');
      await expect.poll(() => [...surface.querySelectorAll('img')].every((image) => image.classList.contains('is-loaded'))).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const rows = [...surface.querySelectorAll<HTMLElement>('.atlas-online-campaign')];
      const list = surface.querySelector<HTMLElement>('.atlas-online-campaigns__list')!.getBoundingClientRect();
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        expect(box.left).toBeGreaterThanOrEqual(list.left - 0.5);
        expect(box.right).toBeLessThanOrEqual(list.right + 0.5);
        expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
      }
      const longName = rows[1]!.querySelector<HTMLElement>('bdi')!;
      expect(longName.scrollWidth).toBeGreaterThan(longName.clientWidth);
      await page.screenshot({ path: `__screenshots__/atlas-online-campaign-picker-${theme}.png`, element: surface });
    });
  }

  it('keeps its size for two campaigns or eight, and scrolls the list past five', async () => {
    const few = mount('dark', CHOICES.slice(0, 2)).getBoundingClientRect().height;
    document.body.empty();
    const surface = mount('dark', MANY);
    expect(surface.getBoundingClientRect().height).toBe(few);
    const list = surface.querySelector<HTMLElement>('.atlas-online-campaigns__list')!;
    const rows = [...list.querySelectorAll<HTMLElement>('.atlas-online-campaign')];
    // Five rows fill the list exactly; the sixth starts below its edge.
    expect(rows[4]!.getBoundingClientRect().bottom).toBeCloseTo(list.getBoundingClientRect().bottom, 0);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    const search = surface.querySelector<HTMLElement>('.atlas-online-campaigns__search')!.getBoundingClientRect();
    expect(search.width).toBeCloseTo(list.getBoundingClientRect().width, 0);
    await page.screenshot({ path: '__screenshots__/atlas-online-campaign-picker-many.png', element: surface });
  });

  it('shows what the search finds, or says it found none, at the same size', async () => {
    const full = mount('light', MANY).getBoundingClientRect().height;
    document.body.empty();
    const found = mount('light', MANY, null, 'the');
    expect(found.getBoundingClientRect().height).toBe(full);
    expect([...found.querySelectorAll<HTMLElement>('.atlas-online-campaign')].filter((row) => !row.hidden)).toHaveLength(3);
    await page.screenshot({ path: '__screenshots__/atlas-online-campaign-picker-search.png', element: found });
    document.body.empty();
    const none = mount('light', MANY, null, 'xyz');
    expect(none.getBoundingClientRect().height).toBe(full);
    expect(none.querySelector<HTMLElement>('.atlas-online-campaigns__none')!.getBoundingClientRect().height).toBeGreaterThan(0);
    await page.screenshot({ path: '__screenshots__/atlas-online-campaign-picker-none.png', element: none });
  });

  it('offers the dashboard where the vault has no campaigns', async () => {
    const surface = mount('dark', []);
    expect(surface.querySelector('.atlas-online-campaigns .atlas-online-button')?.textContent).toBe('Open dashboard');
    expect(surface.querySelector<HTMLButtonElement>('[data-focus-key="start"]')?.disabled).toBe(true);
    await page.screenshot({ path: '__screenshots__/atlas-online-campaign-picker-empty.png', element: surface });
  });
});
