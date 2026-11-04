import '../setup/obsidianDom';
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

const CONDITIONS: ConditionDefinition[] = [
  { id: 'frightened', name: 'Frightened', color: '#c0392b', icon: 'skull', valued: true },
  { id: 'prone', name: 'Prone', color: '#e8e0c8' },
  { id: 'poisoned', name: 'Poisoned', color: '#27ae60' },
  { id: 'blessed', name: 'Blessed', color: '#f1c40f' },
];
vi.mock('../../src/app/react/hooks/useMapConditions', () => ({ useMapConditions: () => CONDITIONS }));

import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { Character } from '../../src/app/types';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import type { InitiativeLayout } from '../../src/app/initiative/initiativeLayout';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** Obsidian's theme as the lists meet it: its sizes, and its own look of every button, which the tracker's controls must undo. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #3a3f36; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: #2a2a2a; --background-modifier-active-hover: #303030; --background-modifier-form-field: #1a1a1a;
    --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777; --interactive-accent: #7f6df2; --interactive-normal: #333; --color-green: #44cf6e; --color-red: #fb464c;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --mono-100: #fff; --mono-0: #000;
    --font-ui-smaller: 12px; --font-ui-small: 13px; --input-height: 30px; --font-interface: sans-serif; }
  button { height: 30px; padding: 4px 12px; background-color: var(--interactive-normal); box-shadow: 0 1px 2px #000; border: 1px solid #555; }
  .clickable-icon { background-color: transparent; box-shadow: none; border: none; color: var(--text-muted); }
  .clickable-icon:hover { background-color: var(--background-modifier-hover); }
`;
const SHOTS = '__screenshots__/init-lists';

function portrait(fill: string, letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${fill}"/><text x="48" y="62" font-size="44" text-anchor="middle" fill="#fff" font-family="sans-serif">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const NAMES = ['Goblin Archer of the Western Hills', 'Mira', 'Cave Rat', 'Brother Aldous', 'Ogre'];
const FILLS = ['#5b7a3a', '#3a5b7a', '#7a5b3a', '#6a3a7a', '#7a3a3a'];
const creature = (index: number): Character => ({
  id: `t${index}`, kind: 'character', name: NAMES[index]!, imagePath: portrait(FILLS[index]!, NAMES[index]![0]!), x: 0, y: 0,
  resources: { hp: { current: 3 + index, max: 10 } },
  ...(index === 1 || index === 3 ? { vision: { enabled: true } } : {}),
  ...(index === 0 ? { conditions: ['frightened', 'prone', 'poisoned', 'blessed'], conditionValues: { frightened: 2 } } : {}),
  ...(index === 2 ? { conditions: ['prone'] } : {}),
});
const entryOf = (index: number, turn: number): InitiativeEntry => ({
  id: `e${index}`, tokenId: `t${index}`, name: NAMES[index]!, initiative: 20 - 3 * index, initiativeModifier: 0,
  imagePath: portrait(FILLS[index]!, NAMES[index]![0]!), isActive: index === turn, isNPC: true, order: index,
});

interface GmView { names?: boolean; layout?: Partial<InitiativeLayout>; sides?: boolean; turn?: number; diceLog?: boolean }

async function showTracker({ names = false, layout = {}, sides = false, turn = 3, diceLog = false }: GmView = {}): Promise<HTMLElement> {
  document.body.innerHTML = '';
  await page.viewport(1200, 900);
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  settings.setInitiativeNames(names);
  settings.setInitiativeLayout({ fromTurn: true, dock: 'right', collapsed: false, ...layout });
  const store = createViewAtlasStore(app, `initiative-lists-${Math.random()}`);
  store.setState({
    persistenceEnabled: false,
    initiativeTrackerOpen: true,
    isDiceLogOpen: diceLog,
    objects: { ...store.getState().objects, tokens: Object.fromEntries([0, 1, 2, 3, 4].map((index) => [`t${index}`, creature(index)])) },
    initiative: {
      ...createDefaultInitiativeState(), isActive: true, round: 2, currentIndex: turn,
      entries: [0, 1, 2, 3, 4].map((index) => entryOf(index, sides ? -1 : turn)),
      ...(sides ? { sides: { first: 'players' as const, active: 'opponents' as const } } : {}),
    },
  });
  const ui = { app, view: null, pixiApp: null, renderer: null } as never;
  render(React.createElement(AtlasUIContext.Provider, { value: ui }, React.createElement(ViewStoreProvider, { store }, React.createElement(InitiativeTracker))));
  return document.querySelector<HTMLElement>('.atlas-initiative-tracker')!;
}

interface PlayerView { names?: boolean; fromTurn?: boolean; dock?: 'left' | 'right'; sides?: boolean }

function showPlayers({ names = false, fromTurn = true, dock = 'right', sides = false }: PlayerView = {}): HTMLElement {
  document.body.innerHTML = '';
  const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  Object.assign(host.style, { position: 'relative', width: '420px', height: '1000px' });
  const entries: PlayerInitiativeEntry[] = [0, 1, 2, 3, 4].map((index) => entryOf(index, sides ? -1 : 3));
  const list = playerInitiativeList(
    { entries, isActive: true, round: 2, ...(sides ? { sides: { first: 'players' as const, active: 'opponents' as const } } : {}) },
    (_, index) => entryTokenOf(creature(index), [], CONDITIONS),
    { mode: sides ? 'sides' : 'turn-order', roll: '1d20', firstSide: 'players' },
    true,
  );
  renderPlayerInitiative(host, list, { showNames: names, portraitSrc: (src) => src, fromTurn, dock });
  return host.querySelector<HTMLElement>('.atlas-player-initiative')!;
}

const box = (element: Element): DOMRect => element.getBoundingClientRect();
const shown = (element: Element): boolean => getComputedStyle(element).display !== 'none' && box(element).height > 0;

/** The panel's padding on all sides and the gaps between its parts are one value. */
function expectUniform(panel: HTMLElement, value: number): void {
  const border = parseFloat(getComputedStyle(panel).borderTopWidth);
  const parts = [...panel.children].filter(shown).map(box);
  const frame = box(panel);
  expect(parts[0]!.top - frame.top - border).toBeCloseTo(value, 0);
  expect(frame.bottom - border - parts.at(-1)!.bottom).toBeCloseTo(value, 0);
  for (const part of parts) {
    expect(part.left - frame.left - border).toBeCloseTo(value, 0);
    expect(frame.right - border - part.right).toBeCloseTo(value, 0);
  }
  for (let i = 1; i < parts.length; i++) expect(parts[i]!.top - parts[i - 1]!.bottom).toBeCloseTo(value, 0);
}

/** Nothing a card holds reaches past the card's sides, and no card past its list. */
function expectNoOverflow(list: HTMLElement, cardSelector: string): void {
  const frame = box(list);
  for (const card of list.querySelectorAll(cardSelector)) {
    const outer = box(card);
    expect(outer.left).toBeGreaterThanOrEqual(frame.left - 0.5);
    expect(outer.right).toBeLessThanOrEqual(frame.right + 0.5);
    for (const part of card.querySelectorAll('*')) {
      if (!shown(part)) continue;
      expect(box(part).left).toBeGreaterThanOrEqual(outer.left - 0.5);
      expect(box(part).right).toBeLessThanOrEqual(outer.right + 0.5);
    }
  }
  expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth);
}

/** `$border-width-m`, which `atlas-panel-radius` takes off: Chromium draws the border a whole pixel wide at 1x. */
const PANEL_BORDER = 1.5;

/** The panel's inner radius less an inset: a corner concentric with the panel's, `inset` inside its border. */
function insetRadius(panel: HTMLElement, inset: number): number {
  return parseFloat(getComputedStyle(panel).borderTopLeftRadius) - PANEL_BORDER - inset;
}

describe('the GM\'s initiative tracker', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => style.remove());

  it('keeps its padding and the gaps between its parts equal, its corner controls concentric, nothing past its cards at 96 and 168 px', async () => {
    for (const names of [false, true]) {
      const tracker = await showTracker({ names });
      expect(box(tracker).width).toBe(names ? 168 : 96);
      expectUniform(tracker, 8);
      expectNoOverflow(tracker.querySelector('.atlas-initiative-tracker__content')!, '.atlas-initiative-card');

      const radius = insetRadius(tracker, 8);
      const toggle = tracker.querySelector('.atlas-initiative-tracker__collapse')!;
      expect(parseFloat(getComputedStyle(toggle).borderTopLeftRadius)).toBeCloseTo(radius, 1);
      expect(parseFloat(getComputedStyle(toggle).borderTopRightRadius)).toBeCloseTo(radius, 1);
      const [previous, next] = [...tracker.querySelectorAll('.atlas-initiative-tracker__turn-controls button')];
      expect(parseFloat(getComputedStyle(previous!).borderBottomLeftRadius)).toBeCloseTo(radius, 1);
      expect(parseFloat(getComputedStyle(next!).borderBottomRightRadius)).toBeCloseTo(radius, 1);
      // The controls of one row are as tall as each other
      const heights = [...tracker.querySelectorAll('.atlas-initiative-tracker__controls button, .atlas-initiative-tracker__turn-controls button')].map((button) => box(button).height);
      expect(new Set(heights).size).toBe(1);
      await page.screenshot({ path: `${SHOTS}/gm-${names ? 'names' : 'normal'}.png`, element: tracker });
    }
  });

  it('starts at the turn with the next round below a divider that fits the column', async () => {
    const tracker = await showTracker();
    const divider = tracker.querySelector('.atlas-initiative-round')!;
    const label = divider.querySelector('.atlas-initiative-round__label')!;
    expect(divider.getAttribute('aria-label')).toBe('Round 3');
    expect(box(label).left).toBeGreaterThanOrEqual(box(divider).left);
    expect(box(label).right).toBeLessThanOrEqual(box(divider).right);
    const order = [...tracker.querySelectorAll('.atlas-initiative-card, .atlas-initiative-round')].map((element) => element.getAttribute('aria-label'));
    expect(order).toEqual(['Brother Aldous', 'Ogre', 'Round 3', NAMES[0], 'Mira', 'Cave Rat']);
    await page.screenshot({ path: `${SHOTS}/gm-rotated.png`, element: tracker });
  });

  it('draws conditions as the map does, 18 px badges inside the card, a valued one with its number', async () => {
    const tracker = await showTracker();
    const card = tracker.querySelector('[aria-label="Goblin Archer of the Western Hills"]')!;
    const badges = [...card.querySelectorAll('.atlas-condition-badge')];
    expect(badges).toHaveLength(4);
    for (const badge of badges) expect(box(badge).width).toBe(18);
    const pip = card.querySelector('.atlas-condition-badge__value')!;
    expect(pip.textContent).toBe('2');
    // The number overhangs its badge, never into the next one
    expect(box(pip).right).toBeLessThan(box(badges[1]!).left);
  });

  it('collapses to the turn and the next two, and docks at the left edge', async () => {
    const collapsed = await showTracker({ layout: { collapsed: true } });
    expect(collapsed.querySelectorAll('.atlas-initiative-card')).toHaveLength(3);
    expectUniform(collapsed, 8);
    await page.screenshot({ path: `${SHOTS}/gm-collapsed.png`, element: collapsed });

    const left = await showTracker({ layout: { dock: 'left' } });
    expect(box(left).left).toBe(12);
    await page.screenshot({ path: `${SHOTS}/gm-docked-left.png`, element: left });

    // Beside the dice log (360 px wide, 12 px from the edge) while it is open, a gap of 8 px between them
    expect(box(await showTracker({ layout: { dock: 'left' }, diceLog: true })).left).toBe(12 + 360 + 8);
  });

  it('goes by sides as groups, the side whose turn it is on top', async () => {
    const tracker = await showTracker({ sides: true });
    expectUniform(tracker, 8);
    expectNoOverflow(tracker.querySelector('.atlas-initiative-tracker__content')!, '.atlas-initiative-card');
    await page.screenshot({ path: `${SHOTS}/gm-sides.png`, element: tracker });
  });
});

describe('the players\' initiative list', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => style.remove());

  it('keeps its padding and gaps equal and nothing past its cards, with names, conditions and a round divider', async () => {
    await page.viewport(1200, 1000);
    for (const names of [false, true]) {
      const panel = showPlayers({ names });
      expect(box(panel).width).toBe(96);
      expectUniform(panel, 8);
      expectNoOverflow(panel.querySelector('.atlas-player-initiative__list')!, '.atlas-player-initiative__card');
      expect(panel.querySelector('.atlas-player-initiative__next-round')?.getAttribute('aria-label')).toBe('Round 3');
      await page.screenshot({ path: `${SHOTS}/players-${names ? 'names' : 'normal'}.png`, element: panel });
    }
  });

  it('follows the GM: docked left, in turn order, and by sides', async () => {
    await page.viewport(1200, 1000);
    const left = showPlayers({ dock: 'left' });
    expect(box(left).left - box(left.parentElement!).left).toBe(12);
    await page.screenshot({ path: `${SHOTS}/players-docked-left.png`, element: left });

    const plain = showPlayers({ fromTurn: false });
    expect(plain.querySelector('.atlas-player-initiative__next-round')).toBeNull();
    await page.screenshot({ path: `${SHOTS}/players-in-order.png`, element: plain });

    const sides = showPlayers({ sides: true });
    expectUniform(sides, 8);
    await page.screenshot({ path: `${SHOTS}/players-sides.png`, element: sides });
  });
});
