import '../setup/obsidianDom';
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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
import { renderTurnBanner } from '../../src/app/initiative/banner/turnBannerElement';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import type { InitiativeLayout, PlayersListEdge } from '../../src/app/initiative/initiativeLayout';
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
  settings.setCompactInitiative(names);
  settings.setInitiativeLayout({ fromTurn: true, dock: 'right', ...layout });
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

interface PlayerView { names?: boolean; fromTurn?: boolean; dock?: PlayersListEdge; sides?: boolean; width?: number; height?: number; pulse?: boolean }

function showPlayers({ names = false, fromTurn = true, dock = 'right', sides = false, width = 420, height = 1000, pulse = false }: PlayerView = {}): HTMLElement {
  document.body.innerHTML = '';
  const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  Object.assign(host.style, { position: 'relative', width: `${width}px`, height: `${height}px` });
  const entries: PlayerInitiativeEntry[] = [0, 1, 2, 3, 4].map((index) => entryOf(index, sides ? -1 : 3));
  const list = playerInitiativeList(
    { entries, isActive: true, round: 2, ...(sides ? { sides: { first: 'players' as const, active: 'opponents' as const } } : {}) },
    (_, index) => entryTokenOf(creature(index), [], CONDITIONS),
    { mode: sides ? 'sides' : 'turn-order', roll: '1d20', firstSide: 'players' },
    true,
  );
  renderPlayerInitiative(host, list, { showNames: names, mapShowsNameplates: true, portraitSrc: (src) => src, fromTurn, dock, pulse });
  return host.querySelector<HTMLElement>('.atlas-player-initiative')!;
}

const box = (element: Element): DOMRect => element.getBoundingClientRect();
const shown = (element: Element): boolean => getComputedStyle(element).display !== 'none' && box(element).height > 0;

/** The panel's padding on all sides and the gaps between its parts are one value. */
function expectUniform(panel: HTMLElement, value: number): void {
  const border = parseFloat(getComputedStyle(panel).borderTopWidth);
  // The panel's surface is a layer behind its parts, not one of them, and the GM's bars float outside it
  const parts = [...panel.children].filter((part) => shown(part) && !part.classList.contains('atlas-player-initiative__surface') && !part.classList.contains('atlas-initiative-tracker__float') && !part.classList.contains('atlas-initiative-tracker__surface') && !part.classList.contains('atlas-initiative-tracker__reach') && !part.classList.contains('atlas-initiative-tracker__round') && !part.classList.contains('atlas-initiative-tracker__top-shade')).map(box);
  const frame = box(panel);
  expect(parts[0]!.top - frame.top - border).toBeCloseTo(value, 0);
  expect(frame.bottom - border - parts.at(-1)!.bottom).toBeCloseTo(value, 0);
  for (const part of parts) {
    expect(part.left - frame.left - border).toBeCloseTo(value, 0);
    expect(frame.right - border - part.right).toBeCloseTo(value, 0);
  }
  for (let i = 1; i < parts.length; i++) expect(parts[i]!.top - parts[i - 1]!.bottom).toBeCloseTo(value, 0);
}

/**
 * A row's inset and gaps are one value: its parts stand that far inside its border on every side, the names of rounds
 * and sides that far from their cards, the cards that far apart; and every card's corner is concentric with the panel's.
 */
function expectRowUniform(panel: HTMLElement, value: number): void {
  const border = parseFloat(getComputedStyle(panel).borderTopWidth);
  const frame = box(panel);
  const parts = [...panel.children].filter((part) => shown(part) && !part.classList.contains('atlas-player-initiative__surface')).map(box).sort((a, b) => a.left - b.left);
  for (const part of parts) {
    expect(part.top - frame.top - border).toBeCloseTo(value, 0);
    expect(frame.bottom - border - part.bottom).toBeCloseTo(value, 0);
  }
  expect(parts[0]!.left - frame.left - border).toBeCloseTo(value, 0);
  expect(frame.right - border - parts.at(-1)!.right).toBeCloseTo(value, 0);
  // Along the row: labels, cards and the line between rounds, in the order they stand
  const items = [...panel.querySelectorAll('.atlas-player-initiative__card, .atlas-player-initiative__round-label, .atlas-player-initiative__side-label, .atlas-player-initiative__round, .atlas-player-initiative__next-round')]
    .map(box).sort((a, b) => a.left - b.left);
  for (let i = 1; i < items.length; i++) {
    const gap = items[i]!.left - items[i - 1]!.right;
    // A round's last card and the next round's name have the slim line and its two gaps between them
    expect(Math.abs(gap - value) < 0.5 || Math.abs(gap - (2 * value + 2)) < 0.5, `gap ${gap}`).toBe(true);
  }
  const radius = insetRadius(panel, value);
  for (const card of panel.querySelectorAll('.atlas-player-initiative__card')) expect(parseFloat(getComputedStyle(card).borderTopLeftRadius)).toBeCloseTo(radius, 1);
}

/** Nothing a card holds reaches past the card's sides, and no card past its list. */
function expectNoOverflow(list: HTMLElement, cardSelector: string): void {
  const frame = box(list);
  for (const card of list.querySelectorAll(cardSelector)) {
    const outer = box(card);
    expect(outer.left).toBeGreaterThanOrEqual(frame.left - 0.5);
    expect(outer.right).toBeLessThanOrEqual(frame.right + 0.5);
    for (const part of card.querySelectorAll('*')) {
      // The red of the life lost slides in from past the art's edge, which clips it
      if (!shown(part) || part.classList.contains('atlas-initiative-wound')) continue;
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
  // The bars show and hide at once, so they are measured where they come to rest
  style.textContent = THEME + css + '.atlas-initiative-tracker__float { transition: none !important; }';
  beforeEach(() => document.head.append(style));
  afterEach(() => style.remove());

  it('keeps its padding and the gaps between its parts equal, its corner controls concentric, nothing past its cards at 96 and 216 px', async () => {
    for (const names of [false, true]) {
      const tracker = await showTracker({ names });
      expect(box(tracker).width).toBe(names ? 216 : 96);
      // $surface-inset: its corner controls run concentric with the panel's
      expectUniform(tracker, 4);
      expectNoOverflow(tracker.querySelector('.atlas-initiative-tracker__content')!, '.atlas-initiative-card');

      // Without the Atlas VTT theme there is no ivy
      expect(getComputedStyle(tracker, '::before').backgroundImage).toBe('none');
      expect(getComputedStyle(tracker, '::after').backgroundImage).toBe('none');
      // The round at the list's foot, in the players' words
      expect(tracker.querySelector('.atlas-initiative-tracker__round')?.textContent).toBe('Round 2');
      // It takes no room: the list runs to the border's inset beneath it, and it lies over the list's foot
      const round = box(tracker.querySelector('.atlas-initiative-tracker__round')!);
      const content = box(tracker.querySelector('.atlas-initiative-tracker__content')!);
      expect(box(tracker).bottom - parseFloat(getComputedStyle(tracker).borderBottomWidth) - round.bottom).toBeCloseTo(0, 0);
      expect(round.top).toBeLessThan(content.bottom);
      expect(getComputedStyle(tracker.querySelector('.atlas-initiative-tracker__round')!).pointerEvents).toBe('none');

      // The bars float $spacing-s above and below the panel, in the middle of its width: capsules whose buttons are
      // concentric with them and as tall as each other
      await userEvent.hover(tracker);
      const panel = box(tracker);
      const top = tracker.querySelector<HTMLElement>('.atlas-initiative-tracker__float--top')!;
      const bottom = tracker.querySelector<HTMLElement>('.atlas-initiative-tracker__float--bottom')!;
      // Within half a pixel: Chromium draws the panel's 1.5 px border 1 px wide at this pixel ratio
      expect(Math.abs(panel.top - box(top).bottom - 8)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(box(bottom).top - panel.bottom - 8)).toBeLessThanOrEqual(0.5);
      for (const bar of [top, bottom]) {
        const frame = box(bar);
        expect((frame.left + frame.right) / 2).toBeCloseTo((panel.left + panel.right) / 2, 0);
        expect(parseFloat(getComputedStyle(bar).borderTopLeftRadius)).toBeGreaterThanOrEqual(frame.height / 2);
        for (const button of bar.querySelectorAll('button')) {
          expect(box(button).height).toBe(28);
          // A capsule too: the bar's inner radius less the inset is half its height
          expect(parseFloat(getComputedStyle(button).borderTopLeftRadius)).toBeCloseTo(14, 1);
        }
      }
      expect(top.querySelectorAll('button')).toHaveLength(3);
      expect(bottom.querySelectorAll('button')).toHaveLength(2);
      await page.screenshot({ path: `${SHOTS}/gm-${names ? 'names' : 'normal'}.png`, element: tracker });
    }
  });

  it('fades the cards that pass under its top edge once the list is scrolled, with a shade as tall as the round\'s', async () => {
    const tracker = await showTracker();
    await page.viewport(1200, 330);
    const content = tracker.querySelector<HTMLElement>('.atlas-initiative-tracker__content')!;
    const shade = tracker.querySelector<HTMLElement>('.atlas-initiative-tracker__top-shade')!;
    const opacityAt = async (scrollTop: number): Promise<number> => {
      content.style.scrollBehavior = 'auto';
      content.scrollTop = scrollTop;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return Number(getComputedStyle(shade).opacity);
    };
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight + 60);
    expect(await opacityAt(0)).toBe(0);
    expect(await opacityAt(22)).toBeCloseTo(0.5, 1);
    expect(await opacityAt(60)).toBe(1);
    await page.screenshot({ path: `${SHOTS}/gm-scrolled.png`, element: tracker });

    // From the panel's border, as the round's shade is from its bottom border, and as tall
    const frame = box(tracker);
    const border = parseFloat(getComputedStyle(tracker).borderTopWidth);
    expect(box(shade).top - frame.top - border).toBeCloseTo(0, 0);
    expect(box(shade).height).toBeCloseTo(box(tracker.querySelector('.atlas-initiative-tracker__round')!).height, 0);
    expect(getComputedStyle(shade).pointerEvents).toBe('none');
  });

  it('keeps a card and its round in a pane shorter than its clearance, and room for its bars in a tall one', async () => {
    const tracker = await showTracker();
    // At most 900 px of view less the clearance above and below and a bar's room (39 px and 8 px of gap) on each side
    expect(box(tracker).height).toBeLessThanOrEqual(486);

    for (const height of [420, 330, 200]) {
      await page.viewport(1200, height);
      const content = box(tracker.querySelector('.atlas-initiative-tracker__content')!);
      const cards = [...tracker.querySelectorAll('.atlas-initiative-card')].map(box);
      const whole = cards.filter((card) => card.top >= content.top - 0.5 && card.bottom <= content.bottom + 0.5);
      expect(whole.length, `${height} px`).toBeGreaterThanOrEqual(1);
      const round = box(tracker.querySelector('.atlas-initiative-tracker__round')!);
      expect(round.bottom, `${height} px`).toBeLessThanOrEqual(box(tracker).bottom);
      expect(round.height, `${height} px`).toBeGreaterThan(10);
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

  it('shows only the art, the number and the look-alike\'s number: red rises in the art by the hit points lost, no bar, no conditions', async () => {
    const tracker = await showTracker();
    const card = tracker.querySelector('[aria-label="Goblin Archer of the Western Hills"]')!;
    expect(card.querySelector('.atlas-condition-badge, .atlas-initiative-card__hp-bar, .atlas-initiative-card__resources')).toBeNull();
    const art = card.querySelector('.atlas-initiative-card__art')!;
    const wound = art.querySelector<HTMLElement>('.atlas-initiative-wound')!;
    wound.style.transition = 'none';
    // 3 of 10 left
    expect(box(art).bottom - box(wound).top).toBeCloseTo(box(art).height * 0.7, 0);
    await page.screenshot({ path: `${SHOTS}/gm-wounds.png`, element: tracker });
  });

  it('hides its bars until the pointer comes near', async () => {
    const tracker = await showTracker();
    for (const bar of tracker.querySelectorAll('.atlas-initiative-tracker__float')) expect(getComputedStyle(bar).opacity).toBe('0');
    // Above the panel, where the top bar shows: near the tracker, outside its panel
    await userEvent.hover(tracker, { position: { x: box(tracker).width / 2, y: -20 } });
    for (const bar of tracker.querySelectorAll('.atlas-initiative-tracker__float')) expect(getComputedStyle(bar).opacity).toBe('1');
  });

  it('stands at the right edge with the dice log open', async () => {
    const tracker = await showTracker({ diceLog: true });
    expect(1200 - box(tracker).right).toBe(12);
  });

  it('goes by sides as groups, the side whose turn it is on top', async () => {
    const tracker = await showTracker({ sides: true });
    expectUniform(tracker, 4);
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
      expectUniform(panel, 4);
      expectNoOverflow(panel.querySelector('.atlas-player-initiative__list')!, '.atlas-player-initiative__card');
      expect(panel.querySelector('.atlas-player-initiative__next-round')?.getAttribute('aria-label')).toBe('Round 3');
      await page.screenshot({ path: `${SHOTS}/players-${names ? 'names' : 'normal'}.png`, element: panel });
    }
  });

  it('runs as a row across the top or the bottom, in the middle, the cards side by side inside the panel', async () => {
    await page.viewport(1300, 600);
    for (const dock of ['top', 'bottom'] as const) {
      for (const sides of [false, true]) {
        const panel = showPlayers({ dock, sides, names: true, width: 1200, height: 500 });
        const host = box(panel.parentElement!);
        const frame = box(panel);
        // Along the chosen edge, in its middle, clear of the widget bar's corner
        expect(Math.abs((frame.left + frame.right) / 2 - (host.left + host.right) / 2)).toBeLessThan(1);
        if (dock === 'top') expect(frame.top - host.top).toBeCloseTo(12, 0);
        else expect(host.bottom - frame.bottom).toBeCloseTo(12, 0);
        expect(frame.width).toBeLessThanOrEqual(host.width - 320 + 0.5);
        const cards = [...panel.querySelectorAll('.atlas-player-initiative__card')].map(box);
        expect(cards.length).toBe(5);
        // Side by side, left to right, each inside the panel, every card one height whatever round or side it is in
        for (let i = 1; i < cards.length; i++) expect(cards[i]!.left).toBeGreaterThan(cards[i - 1]!.right - 0.5);
        expect(new Set(cards.map((card) => Math.round(card.height))).size).toBe(1);
        // Square cards, the number in the top right corner over the art
        for (const card of panel.querySelectorAll('.atlas-player-initiative__card')) {
          expect(Math.abs(box(card).width - box(card).height)).toBeLessThan(0.5);
          const value = card.querySelector('.atlas-player-initiative__value');
          if (value) expect(box(card).right - box(value).right).toBeCloseTo(box(value).top - box(card).top, 0);
          // The hit points: a capsule as far inside the card's border at its foot as at its sides, its ends concentric
          // with the card's bottom corners
          const hp = card.querySelector('.atlas-player-initiative__hp');
          if (!hp) continue;
          // Conditions sit over the hit points and peek out below the card, inside the panel's inset
          const badges = card.querySelector('.atlas-player-initiative__conditions');
          if (badges) {
            expect(box(badges).top).toBeLessThan(box(hp).bottom);
            expect(box(badges).bottom).toBeGreaterThan(box(card).bottom);
            expect(frame.bottom - parseFloat(getComputedStyle(panel).borderBottomWidth) - box(badges).bottom).toBeGreaterThanOrEqual(4 - 0.5);
          }
          const border = parseFloat(getComputedStyle(card).borderTopWidth);
          const inset = box(hp).left - box(card).left - border;
          expect(inset).toBeCloseTo(4, 0);
          expect(box(card).right - border - box(hp).right).toBeCloseTo(inset, 0);
          expect(box(card).bottom - border - box(hp).bottom).toBeCloseTo(inset, 0);
          const cardInner = parseFloat(getComputedStyle(card).borderBottomLeftRadius) - border;
          expect(box(hp).height / 2).toBeCloseTo(cardInner - inset, 1);
        }
        for (const card of cards) {
          expect(card.top).toBeGreaterThanOrEqual(frame.top);
          expect(card.bottom).toBeLessThanOrEqual(frame.bottom);
        }
        expectNoOverflow(panel.querySelector('.atlas-player-initiative__list')!, '.atlas-player-initiative__card');
        expectRowUniform(panel, 4);
        await page.screenshot({ path: `${SHOTS}/players-${dock}${sides ? '-sides' : ''}.png`, element: panel });
      }
    }
  });

  it('follows the GM: in turn order, and by sides', async () => {
    await page.viewport(1200, 1000);
    const plain = showPlayers({ fromTurn: false });
    expect(plain.querySelector('.atlas-player-initiative__next-round')).toBeNull();
    await page.screenshot({ path: `${SHOTS}/players-in-order.png`, element: plain });

    const sides = showPlayers({ sides: true });
    expectUniform(sides, 4);
    await page.screenshot({ path: `${SHOTS}/players-sides.png`, element: sides });
  });

  it('pulses the turn\'s border as thick as the turn banner\'s flash, at the banner\'s size', async () => {
    await page.viewport(1200, 1000);
    const panel = showPlayers({ pulse: true });
    panel.parentElement!.style.setProperty('--atlas-player-turn-banner-scale', '2');
    const host = panel.parentElement!.createDiv({ cls: 'atlas-player-turn-banner' });
    const banner = renderTurnBanner(host, { key: 'k', round: null, title: 'Goblin', portrait: null }, (src) => src);
    const ring = parseFloat(getComputedStyle(panel.querySelector('.atlas-player-initiative__card--active')!, '::after').borderTopWidth);
    // The banner is zoomed: its flash's 2 px are drawn twice as wide
    const flash = parseFloat(getComputedStyle(banner, '::before').borderTopWidth) * parseFloat(getComputedStyle(banner).zoom);
    expect(ring).toBe(4);
    expect(flash).toBe(ring);
    host.remove();
    await page.screenshot({ path: `${SHOTS}/players-pulse.png`, element: panel });
  });
});
