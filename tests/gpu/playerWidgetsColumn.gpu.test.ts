import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { createStore } from 'zustand/vanilla';
import css from '../../styles/main.scss?inline';
import { PlayerWidgetBar } from '../../src/app/services/PlayerWidgetBar';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import type { SettingsService } from '../../src/app/services/SettingsService';
import type { PlayersListEdge } from '../../src/app/initiative/initiativeLayout';
import type { CounterWidget } from '../../src/app/types/widgetTypes';
import type { Character } from '../../src/app/types';

const THEME = `
  body { margin: 0; font: 13px/1.5 sans-serif; --background-primary: #1e1e1e; --background-modifier-border: #363636; --text-normal: #dadada;
    --text-muted: #b3b3b3; --interactive-accent: #7f6df2; --mono-100: #fff; --font-ui-small: 13px; --font-ui-smaller: 12px; }
`;

const counter = (id: string, label: string, order: number): CounterWidget => ({
  id, type: 'counter', label, icon: 'skull', visible: true, visibleToPlayers: true, value: 3, order,
});

function settingsFor(edges: PlayersListEdge[]): SettingsService {
  return {
    getLocalPlayerViewSettings: () => ({ showWidgets: true }),
    initiativeLayout: () => ({ fromTurn: true, dock: edges[0]!, edges, facesPlayers: edges[0] !== 'right' }),
    onChange: () => () => undefined,
  } as unknown as SettingsService;
}

const creature = (index: number): Character => ({ id: `t${index}`, kind: 'character', name: `Goblin ${index}`, imagePath: '', x: 0, y: 0 });
const entryOf = (index: number): PlayerInitiativeEntry => ({
  id: `e${index}`, tokenId: `t${index}`, name: `Goblin ${index}`, initiative: 20 - index, initiativeModifier: 0,
  imagePath: '', isActive: index === 0, isNPC: true, order: index,
} as PlayerInitiativeEntry);

/** The player window's overlays: a transformed layer that holds the widgets and the lists, as `player-window.scss` has it. */
function showPlayerView(edges: PlayersListEdge[], labels: string[], combatants: number): { layer: HTMLElement; bar: PlayerWidgetBar } {
  document.body.innerHTML = '';
  const layer = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  Object.assign(layer.style, { position: 'relative', width: '1000px', height: '700px', transform: 'translate(0, 0)' });
  const bar = new PlayerWidgetBar(settingsFor(edges));
  bar.mount(layer);
  const widgets = Object.fromEntries(labels.map((label, index) => [`w${index}`, counter(`w${index}`, label, index)]));
  bar.present(createStore(() => ({ widgetSettings: { widgets, globalVisible: true, position: 'top', scale: 1 }, widgetValues: {} })) as never);
  const list = playerInitiativeList(
    { entries: Array.from({ length: combatants }, (_, index) => entryOf(index)), isActive: true, round: 1 },
    (_, index) => entryTokenOf(creature(index), [], []),
    { mode: 'turn-order', roll: '1d20', firstSide: 'players' },
    true,
  );
  for (const dock of edges) renderPlayerInitiative(layer, list, { showNames: false, mapShowsNameplates: false, portraitSrc: (src) => src, fromTurn: true, dock });
  return { layer, bar };
}

const box = (element: Element): DOMRect => element.getBoundingClientRect();
const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('the players\' widgets beside a horizontal initiative list', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => style.remove());

  it('stand as a column down the right edge, and neither row meets them however wide they are', async () => {
    await page.viewport(1000, 700);
    for (const labels of [['Doom'], ['Doom', 'Torches'], ['Doom', 'The ritual completes at midnight', 'Torches']]) {
      const { layer, bar } = showPlayerView(['top', 'bottom'], labels, 12);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const cards = [...layer.querySelectorAll('.atlas-widget')].map(box);
      // One above the other, their right edges on one line
      for (let i = 1; i < cards.length; i++) {
        expect(cards[i]!.top).toBeGreaterThanOrEqual(cards[i - 1]!.bottom);
        expect(cards[i]!.right).toBeCloseTo(cards[0]!.right, 0);
      }
      const rows = [...layer.querySelectorAll('.atlas-player-initiative')].map(box);
      expect(rows).toHaveLength(2);
      for (const row of rows) for (const card of cards) expect(overlaps(row, card), labels.join(', ')).toBe(false);
      // The rows stay in the middle: as far from the left edge as from the column's room
      for (const row of rows) expect(row.left - box(layer).left).toBeCloseTo(box(layer).right - row.right, 0);
      await page.screenshot({ path: `__screenshots__/player-widgets/column-${labels.length}.png` });
      bar.destroy();
    }
  });

  it('stay a row at the top right beside the vertical list, which leaves them no room of its own', async () => {
    const { layer, bar } = showPlayerView(['right'], ['Doom', 'Torches'], 3);
    const [first, second] = [...layer.querySelectorAll('.atlas-widget')].map(box);
    expect(second!.left).toBeGreaterThanOrEqual(first!.right);
    expect(layer.style.getPropertyValue('--atlas-player-widgets-room')).toBe('');
    bar.destroy();
  });

  it('glide from a row to a column and back as the players\' list changes its shape', async () => {
    await page.viewport(1000, 700);
    document.body.innerHTML = '';
    const layer = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
    Object.assign(layer.style, { position: 'relative', width: '1000px', height: '700px', transform: 'translate(0, 0)' });
    let edges: PlayersListEdge[] = ['right'];
    const listeners: (() => void)[] = [];
    const settings = {
      getLocalPlayerViewSettings: () => ({ showWidgets: true }),
      initiativeLayout: () => ({ fromTurn: true, dock: edges[0]!, edges, facesPlayers: edges[0] !== 'right' }),
      onChange: (listener: () => void) => { listeners.push(listener); return () => undefined; },
    } as unknown as SettingsService;
    const bar = new PlayerWidgetBar(settings);
    bar.mount(layer);
    const widgets = Object.fromEntries(['Doom', 'Torches'].map((label, index) => [`w${index}`, counter(`w${index}`, label, index)]));
    bar.present(createStore(() => ({ widgetSettings: { widgets, globalVisible: true, position: 'top', scale: 1 }, widgetValues: {} })) as never);
    const card = (id: string): Element => layer.querySelector(`[data-turn-key="widget:${id}"]`)!;
    const row = { doom: box(card('w0')), torches: box(card('w1')) };
    expect(row.torches.left).toBeGreaterThan(row.doom.right);

    edges = ['top', 'bottom'];
    for (const listener of listeners) listener();
    for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 0; }
    // Each starts where it stood in the row, and glides into the column
    expect(box(card('w0')).left).toBeCloseTo(row.doom.left, 0);
    expect(box(card('w1')).left).toBeCloseTo(row.torches.left, 0);
    for (const animation of document.getAnimations()) animation.finish();
    expect(box(card('w1')).top).toBeGreaterThan(box(card('w0')).bottom);
    bar.destroy();
  });
});

