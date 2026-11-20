import '../setup/obsidianDom';
import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { InitiativeTracker } from '../../src/app/react/components/InitiativeTracker';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { Character } from '../../src/app/types';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import type { PlayersListEdge } from '../../src/app/initiative/initiativeLayout';
import { adoptGhosts, ghostsOf, playTurnMotion, snapshotTurn, TURN_MOVE_MS } from '../../src/app/initiative/motion/turnMotion';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const THEME = `
  body { margin: 0; font: 13px/1.5 sans-serif; background: #3a3f36; --background-primary: #1e1e1e; --background-modifier-border: #363636;
    --background-modifier-hover: #2a2a2a; --text-normal: #dadada; --text-muted: #b3b3b3; --interactive-accent: #7f6df2; --mono-100: #fff;
    --color-green: #44cf6e; --color-red: #fb464c; --font-ui-small: 13px; --font-ui-smaller: 12px; --radius-m: 8px; }
`;
const SHOTS = '__screenshots__/turn-motion';
const NAMES = ['Goblin', 'Mira', 'Cave Rat', 'Aldous', 'Ogre'];
const FILLS = ['#5b7a3a', '#3a5b7a', '#7a5b3a', '#6a3a7a', '#7a3a3a'];

function portrait(index: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${FILLS[index]}"/><text x="48" y="62" font-size="44" text-anchor="middle" fill="#fff" font-family="sans-serif">${NAMES[index]![0]}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
const creature = (index: number): Character => ({ id: `t${index}`, kind: 'character', name: NAMES[index]!, imagePath: portrait(index), x: 0, y: 0 });
const entryOf = (index: number, turn: number): InitiativeEntry => ({
  id: `e${index}`, tokenId: `t${index}`, name: NAMES[index]!, initiative: 20 - 3 * index, initiativeModifier: 0,
  imagePath: portrait(index), isActive: index === turn, isNPC: true, order: index,
});

const box = (element: Element): DOMRect => element.getBoundingClientRect();
const running = (element: Element): Animation[] => element.getAnimations().filter((animation) => animation.playState !== 'finished' && animation.timeline instanceof DocumentTimeline);
const byTime = (animation: Animation): boolean => animation.timeline instanceof DocumentTimeline;

/** Every animation in the document held at `ms` of its own time, so a frame can be measured and drawn. */
function holdAt(ms: number): void {
  // Scroll-driven ones (the tracker's top shade) run by the list's scroll, not by time
  for (const animation of document.getAnimations().filter(byTime)) {
    animation.pause();
    animation.currentTime = ms;
  }
}

/** Every animation with an end run to it; a pulse that never ends is left where it is. */
function finishAll(): void {
  for (const animation of document.getAnimations().filter(byTime)) if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
}

/** The players' list at `edge` with the turn at `turn`, drawn anew as `PlayerInitiativePanel.refresh` does, gliding from the last. */
function drawPlayers(host: HTMLElement, turn: number, edge: PlayersListEdge): HTMLElement {
  const old = host.querySelector<HTMLElement>('.atlas-initiative-panel__list');
  const places = snapshotTurn(old);
  const ghosts = ghostsOf(old);
  host.empty();
  const entries: PlayerInitiativeEntry[] = [0, 1, 2, 3, 4].map((index) => entryOf(index, turn));
  const list = playerInitiativeList({ entries, isActive: true, round: 2 }, (_, index) => entryTokenOf(creature(index), [], []), { mode: 'turn-order', roll: '1d20', firstSide: 'players' }, true);
  renderPlayerInitiative(host, list, { showNames: false, mapShowsNameplates: true, portraitSrc: (src) => src, fromTurn: true, dock: edge });
  const fresh = host.querySelector<HTMLElement>('.atlas-initiative-panel__list')!;
  adoptGhosts(fresh, ghosts);
  playTurnMotion(fresh, places);
  return fresh;
}

describe('the turn passing on and back', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => style.remove());

  for (const edge of ['right', 'left', 'bottom'] as const) {
    it(`glides every card one place on the players' list at the ${edge}, who acted sliding out at the front and in at the end, and back`, async () => {
      await page.viewport(1000, 700);
      document.body.innerHTML = '';
      const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
      Object.assign(host.style, { position: 'relative', width: '1000px', height: '700px' });
      drawPlayers(host, 1, edge);
      // In the list's frame: a row's panel may change its width by a few pixels as its rounds change
      const inList = (element: Element): { left: number; top: number } => {
        const list = box(host.querySelector('.atlas-initiative-panel__list')!);
        return { left: box(element).left - list.left, top: box(element).top - list.top };
      };
      const at = (key: string): { left: number; top: number } => inList(host.querySelector(`[data-turn-key="${key}"]`)!);
      const rest = { mira: at('t1'), rat: at('t2') };
      // A row's divider before the next round glides with the cards, never ahead of them
      const line = edge === 'bottom' ? at('round:3') : null;

      // On: Cave Rat takes Mira's place at the front, Mira leaves the front and comes in at the end
      const list = drawPlayers(host, 2, edge);
      const ghosts = ghostsOf(list);
      expect(ghosts).toHaveLength(1);
      holdAt(0);
      // Each card starts where it stood: Cave Rat where it was, the leaving copy where Mira was
      expect(at('t2').left).toBeCloseTo(rest.rat.left, 0);
      expect(at('t2').top).toBeCloseTo(rest.rat.top, 0);
      expect(inList(ghosts[0]!).left).toBeCloseTo(rest.mira.left, 0);
      expect(inList(ghosts[0]!).top).toBeCloseTo(rest.mira.top, 0);
      if (line) expect(at('round:3').left).toBeCloseTo(line.left, 0);
      holdAt(TURN_MOVE_MS / 2);
      await page.screenshot({ path: `${SHOTS}/players-${edge}-on-mid.png` });
      holdAt(TURN_MOVE_MS + 200);
      // Every card at its place, the copy gone from sight
      expect(at('t2').left).toBeCloseTo(rest.mira.left, 0);
      expect(at('t2').top).toBeCloseTo(rest.mira.top, 0);
      expect(parseFloat(getComputedStyle(ghosts[0]!).opacity)).toBe(0);
      finishAll();

      // Back: Mira comes in at the front again, from before it, and the last card leaves at the end
      const back = drawPlayers(host, 1, edge);
      expect(ghostsOf(back).length).toBeGreaterThanOrEqual(1);
      holdAt(0);
      // Cave Rat starts at the front, where it stood, and glides one place on
      expect(at('t2').left).toBeCloseTo(rest.mira.left, 0);
      expect(at('t2').top).toBeCloseTo(rest.mira.top, 0);
      expect(parseFloat(getComputedStyle(back.querySelector('[data-turn-key="t1"]')!).opacity)).toBe(0);
      holdAt(TURN_MOVE_MS / 2);
      await page.screenshot({ path: `${SHOTS}/players-${edge}-back-mid.png` });
      holdAt(TURN_MOVE_MS + 200);
      expect(at('t2').left).toBeCloseTo(rest.rat.left, 0);
      expect(at('t2').top).toBeCloseTo(rest.rat.top, 0);
    });
  }

  it('carries every card on from where it stood when the list is drawn again in the middle of a glide', async () => {
    document.body.innerHTML = '';
    const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
    Object.assign(host.style, { position: 'relative', width: '1000px', height: '700px' });
    drawPlayers(host, 1, 'right');
    drawPlayers(host, 2, 'right');
    holdAt(TURN_MOVE_MS / 2);
    const midway = box(host.querySelector('[data-turn-key="t3"]')!);
    // Something else changed: the list is drawn again with the same turn
    const again = drawPlayers(host, 2, 'right');
    holdAt(0);
    expect(box(again.querySelector('[data-turn-key="t3"]')!).top).toBeCloseTo(midway.top, 0);
    // The copy still sliding out came along
    expect(ghostsOf(again)).toHaveLength(1);
  });

  it('glides the GM\'s cards the same way, lights up who holds the turn, and comes and goes as the players\' list does', async () => {
    await page.viewport(1200, 900);
    document.body.innerHTML = '';
    const { app } = createInMemoryApp({ files: {} });
    const settings = new SettingsService(app);
    settings.setInitiativeLayout({ fromTurn: true, dock: 'right' });
    const store = createViewAtlasStore(app, `turn-motion-${Math.random()}`);
    store.setState({
      persistenceEnabled: false,
      initiativeTrackerOpen: true,
      objects: { ...store.getState().objects, tokens: Object.fromEntries([0, 1, 2, 3, 4].map((index) => [`t${index}`, creature(index)])) },
      initiative: { ...createDefaultInitiativeState(), isActive: true, round: 2, currentIndex: 1, entries: [0, 1, 2, 3, 4].map((index) => entryOf(index, 1)) },
    });
    const ui = { app, view: null, pixiApp: null, renderer: null } as never;
    render(React.createElement(AtlasUIContext.Provider, { value: ui }, React.createElement(ViewStoreProvider, { store }, React.createElement(InitiativeTracker))));
    const tracker = document.querySelector<HTMLElement>('.atlas-initiative-tracker')!;
    // Opened with the map: no motion
    expect(running(tracker)).toHaveLength(0);
    const card = (id: string): HTMLElement => tracker.querySelector<HTMLElement>(`[data-turn-key="${id}"]`)!;
    const rest = { mira: box(card('e1')), rat: box(card('e2')) };

    await act(async () => store.getState().nextTurn(new Set()));
    expect(card('e2').classList.contains('atlas-initiative-card--turn-flash')).toBe(true);
    holdAt(0);
    expect(box(card('e2')).top).toBeCloseTo(rest.rat.top, 0);
    expect(tracker.querySelectorAll('.atlas-initiative-ghost')).toHaveLength(1);
    holdAt(TURN_MOVE_MS / 2);
    await page.screenshot({ path: `${SHOTS}/gm-on-mid.png` });
    holdAt(TURN_MOVE_MS + 200);
    expect(box(card('e2')).top).toBeCloseTo(rest.mira.top, 0);
    finishAll();

    await act(async () => store.getState().previousTurn(new Set()));
    holdAt(0);
    expect(box(card('e2')).top).toBeCloseTo(rest.mira.top, 0);
    holdAt(TURN_MOVE_MS + 200);
    expect(box(card('e2')).top).toBeCloseTo(rest.rat.top, 0);
    finishAll();

    // Closed: it stays drawn while it leaves towards the right edge, then is gone
    await act(async () => store.getState().setInitiativeTrackerOpen(false));
    expect(document.querySelector('.atlas-initiative-tracker--leaving')).not.toBeNull();
    const exit = running(tracker)[0]!;
    exit.pause();
    exit.currentTime = 120;
    expect(box(tracker).left).toBeGreaterThan(rest.mira.left - 12);
    await act(async () => {
      exit.finish();
      await exit.finished;
      await Promise.resolve();
    });
    expect(document.querySelector('.atlas-initiative-tracker')).toBeNull();

    // Opened: it comes in from the right edge, its cards after it
    await act(async () => store.getState().setInitiativeTrackerOpen(true));
    const opened = document.querySelector<HTMLElement>('.atlas-initiative-tracker')!;
    expect(running(opened).length).toBeGreaterThan(0);
    expect(running(opened.querySelector('[data-turn-key="e0"]')!).length).toBeGreaterThan(0);
    holdAt(140);
    await page.screenshot({ path: `${SHOTS}/gm-enter-mid.png` });
  });

  it('glides the GM\'s tracker to its new size as the compact view is switched on and off, its cards fading in anew', async () => {
    await page.viewport(1200, 900);
    document.body.innerHTML = '';
    const { app } = createInMemoryApp({ files: {} });
    const settings = new SettingsService(app);
    settings.setInitiativeLayout({ dock: 'right' });
    const store = createViewAtlasStore(app, `look-morph-${Math.random()}`);
    store.setState({
      persistenceEnabled: false,
      initiativeTrackerOpen: true,
      objects: { ...store.getState().objects, tokens: Object.fromEntries([0, 1, 2, 3, 4].map((index) => [`t${index}`, creature(index)])) },
      initiative: { ...createDefaultInitiativeState(), isActive: true, round: 2, currentIndex: 1, entries: [0, 1, 2, 3, 4].map((index) => entryOf(index, 1)) },
    });
    const ui = { app, view: null, pixiApp: null, renderer: null } as never;
    render(React.createElement(AtlasUIContext.Provider, { value: ui }, React.createElement(ViewStoreProvider, { store }, React.createElement(InitiativeTracker))));
    const tracker = document.querySelector<HTMLElement>('.atlas-initiative-tracker')!;
    const cards = { width: box(tracker).width, height: box(tracker).height };

    await act(async () => settings.setCompactInitiative(true));
    holdAt(0);
    // It starts at the size it had, its cards not yet in sight
    expect(box(tracker).width).toBeCloseTo(cards.width, 0);
    expect(box(tracker).height).toBeCloseTo(cards.height, 0);
    expect(Number(getComputedStyle(tracker.querySelector('[data-turn-key="e0"]')!).opacity)).toBe(0);
    holdAt(190);
    await page.screenshot({ path: `${SHOTS}/gm-compact-mid.png` });
    finishAll();
    const lines = { width: box(tracker).width, height: box(tracker).height };
    expect(lines.width).toBeGreaterThan(cards.width);

    await act(async () => settings.setCompactInitiative(false));
    holdAt(0);
    expect(box(tracker).width).toBeCloseTo(lines.width, 0);
    finishAll();
    expect(box(tracker).width).toBeCloseTo(cards.width, 0);
  });
});

