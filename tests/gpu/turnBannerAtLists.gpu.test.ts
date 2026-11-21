import '../setup/obsidianDom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { createStore, type StoreApi } from 'zustand/vanilla';
import css from '../../styles/main.scss?inline';
import windowCss from '../../src/app/services/player-window.scss?inline';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../src/app/types/initiativeTypes';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative } from '../../src/app/services/playerInitiativeList';
import { PlayerTurnBanner } from '../../src/app/services/PlayerTurnBanner';
import { renderTurnBanner } from '../../src/app/initiative/banner/turnBannerElement';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { PlayersListEdge } from '../../src/app/initiative/initiativeLayout';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const NAMES = ['Mira', 'Ogre', 'Cave Rat'];
const creature = (index: number): Character => ({ id: `t${index}`, kind: 'character', name: NAMES[index]!, imagePath: '', x: 0, y: 0 } as Character);
const entryOf = (index: number, turn: number): InitiativeEntry => ({
  id: `e${index}`, tokenId: `t${index}`, name: NAMES[index]!, initiative: 20 - index, initiativeModifier: 0, imagePath: '', isActive: index === turn, isNPC: true, order: index,
});
const fight = (turn: number): InitiativeState => ({ ...createDefaultInitiativeState(), isActive: true, round: 1, entries: [0, 1, 2].map((index) => entryOf(index, turn)) });

const style = document.createElement('style');
style.textContent = css + windowCss;
document.head.append(style);

afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});

/** The player window as `PlayerWindowService` builds it: overlays turned with the TV, the lists, then the banner over them. */
async function showAtLists(rotation: number, edges: PlayersListEdge[], faces: boolean): Promise<{ lists: HTMLElement[]; banners: HTMLElement[] }> {
  await page.viewport(1600, 900);
  document.body.className = 'atlas-player-window';
  document.body.style.setProperty('--atlas-tv-rotation', `${rotation}deg`);
  document.body.dataset.tvRotation = String(rotation);
  const overlays = document.body.createDiv({ cls: 'atlas-player-overlays' });
  overlays.toggleClass('atlas-player-overlays--sideways', rotation === 90 || rotation === 270);
  const container = overlays.createDiv({ cls: 'atlas-player-initiative-container' });
  const list = playerInitiativeList(fight(1), (_, index) => entryTokenOf(creature(index), [], []), { mode: 'turn-order', roll: '1d20', firstSide: 'players' }, false);
  for (const dock of edges) renderPlayerInitiative(container, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, dock, faces });

  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  settings.setLocalPlayerViewSettings({ turnBannerAtLists: true });
  settings.setInitiativeLayout({ edges, facesPlayers: faces });
  const store = createStore(() => ({
    initiative: fight(0), initiativeTrackerOpen: true, mapPath: 'a.atlasmap', isMapLoading: false,
    objects: { tokens: Object.fromEntries([0, 1, 2].map((index) => [`t${index}`, creature(index)])) },
  })) as unknown as StoreApi<ViewAtlasState>;
  const banner = new PlayerTurnBanner(app, settings);
  banner.mount(overlays);
  banner.present(store);
  store.setState({ initiative: fight(1) });
  // Past the banner's entrance
  await new Promise((resolve) => setTimeout(resolve, 800));
  return {
    lists: [...document.querySelectorAll<HTMLElement>('.atlas-player-initiative')],
    banners: [...document.querySelectorAll<HTMLElement>('.atlas-player-turn-banner__anchor .atlas-turn-banner')],
  };
}

/** A banner touches its list from the room's side, a little way off, centred on it along the list's length. */
function expectBeside(banner: HTMLElement, list: HTMLElement, towards: 'up' | 'down' | 'left' | 'right'): void {
  const b = banner.getBoundingClientRect();
  const l = list.getBoundingClientRect();
  const gap = { up: l.top - b.bottom, down: b.top - l.bottom, left: l.left - b.right, right: b.left - l.right }[towards];
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(24);
  const across = towards === 'up' || towards === 'down';
  const offCentre = across ? (b.left + b.right) / 2 - (l.left + l.right) / 2 : (b.top + b.bottom) / 2 - (l.top + l.bottom) / 2;
  expect(Math.abs(offCentre)).toBeLessThan(2);
}

describe('the turn banner at the players\' lists', () => {
  it('stands just above each list that faces its edge, centred on it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { lists, banners } = await showAtLists(0, ['bottom', 'top', 'right'], true);
    expect(banners).toHaveLength(3);
    expectBeside(banners[0]!, lists[0]!, 'up');
    expectBeside(banners[1]!, lists[1]!, 'down');
    expectBeside(banners[2]!, lists[2]!, 'left');
  });

  it('stands on the inner side of each upright list: below the top row, above the bottom one, beside the column', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { lists, banners } = await showAtLists(0, ['bottom', 'top', 'right'], false);
    expect(banners).toHaveLength(3);
    expectBeside(banners[0]!, lists[0]!, 'up');
    expectBeside(banners[1]!, lists[1]!, 'down');
    expectBeside(banners[2]!, lists[2]!, 'left');
  });

  it('stays at its list on a table TV turned half way or sideways', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Turned half way round, the overlays' bottom edge is the screen's top
    let shown = await showAtLists(180, ['bottom', 'top'], true);
    expectBeside(shown.banners[0]!, shown.lists[0]!, 'down');
    expectBeside(shown.banners[1]!, shown.lists[1]!, 'up');
    document.body.innerHTML = '';
    // A quarter turn clockwise: the overlays' bottom edge is the screen's left
    shown = await showAtLists(90, ['bottom'], true);
    expectBeside(shown.banners[0]!, shown.lists[0]!, 'right');
    document.body.innerHTML = '';
    // A row on each long side of a TV turned a quarter
    shown = await showAtLists(90, ['top', 'bottom'], true);
    expectBeside(shown.banners[0]!, shown.lists[0]!, 'left');
    expectBeside(shown.banners[1]!, shown.lists[1]!, 'right');
  });
});

describe('a fight\'s banner at the players\' lists', () => {
  it.each(['above', 'below', 'left'] as const)('shows its words whole, centred on its anchor, on its shade (%s)', async (side) => {
    await page.viewport(1600, 900);
    document.body.className = 'atlas-player-window';
    const host = document.body.createDiv({ cls: 'atlas-player-turn-banner' });
    const anchor = host.createDiv({ cls: 'atlas-player-turn-banner__anchor', attr: { 'data-side': side } });
    anchor.style.setProperty('--atlas-anchor-x', '800px');
    anchor.style.setProperty('--atlas-anchor-y', '450px');
    const banner = renderTurnBanner(anchor, { kind: 'fight-end', key: 'fight-end', round: null, title: 'Combat has ended', portrait: null }, () => null);
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const title = banner.querySelector<HTMLElement>('.atlas-fight-banner__title')!;
    expect(title.getBoundingClientRect().width).toBeGreaterThan(120);
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth);
    const at = banner.getBoundingClientRect();
    if (side === 'left') expect(Math.abs((at.top + at.bottom) / 2 - 450)).toBeLessThan(2);
    else expect(Math.abs((at.left + at.right) / 2 - 800)).toBeLessThan(2);
    expect(getComputedStyle(banner, '::before').opacity).toBe('1');
  });
});
