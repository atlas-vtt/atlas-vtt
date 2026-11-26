import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';
import css from '../../styles/main.scss?inline';
import tableCss from '../../src/app/tableMode/table-mode.scss?inline';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { PAIR_HOLD_MS } from '../../src/app/pixi/input/touchGestures';
import { SettingsService } from '../../src/app/services/SettingsService';
import { getHistoryStore } from '../../src/app/stores/history';
import { TableMode } from '../../src/app/tableMode/TableMode';
import { CHIP_HOLD_MS } from '../../src/app/tableMode/holdToLeave';
import type { Character } from '../../src/app/types';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { mouse } from './realMouse';
import { frame, touch, touchMaps, TOKEN, wait, type Point, type TouchMap } from './touchHarness';

const openContextMenuGlobal = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../src/app/react/root/ContextMenuContext', async (original) => ({
  ...(await original<typeof import('../../src/app/react/root/ContextMenuContext')>()),
  openContextMenuGlobal,
  closeContextMenuGlobal: vi.fn(),
}));

const THEME = `
  body { margin: 0; font: 13px/1.5 sans-serif; background: #1e1e1e; --background-primary: #1e1e1e; --text-normal: #dadada; --text-muted: #b3b3b3;
    --text-on-accent: #fff; --interactive-accent: #7f6df2; --mono-100: #fff; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-semibold: 600; --shadow-l: 0 8px 24px rgba(0, 0, 0, 0.5); }
`;
const TABLET = { width: 1180, height: 820 };
const { map } = touchMaps();
/** Open floor, away from the token. */
const EMPTY: Point = { x: 700, y: 500 };

/** The GM's surfaces of a map view, each with the class the stylesheet knows it by. */
const GM_SURFACES = [
  '.atlas-scene-tab-bar', '.atlas-widget-bar', '.atlas-main-toolbar', '.atlas-undo-redo-controls', '.atlas-zoom-cluster',
  '.atlas-selection-bar', '.atlas-level-switcher', '.atlas-initiative-tracker', '.atlas-note-preview-layer',
];

interface Table {
  m: TouchMap;
  root: HTMLElement;
  lighting: LightingController;
  /** A menu, standing where Atlas' floating UI stands: under the window's body. */
  floating: HTMLElement;
}

const camera = (m: TouchMap): { x: number; y: number; scale: number } => ({ x: m.viewport.x, y: m.viewport.y, scale: m.viewport.scale.x });
const shown = (selector: string): boolean => {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  return !!rect && rect.width > 0 && rect.height > 0;
};
const centreOf = (element: Element): Point => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};
/** Lets what coasts come to rest. */
async function rest(m: TouchMap): Promise<void> {
  let before = camera(m);
  for (let i = 0; i < 200; i++) {
    await frame();
    const now = camera(m);
    if (now.x === before.x && now.y === before.y && now.scale === before.scale) return;
    before = now;
  }
}

/**
 * A map view of a tablet's size as the GM has it: a lit scene with a door, a light and a hidden
 * token beside the party's, the GM's bars and panels around the canvas, a menu floating over it.
 */
async function table(): Promise<Table> {
  const style = document.head.appendChild(document.createElement('style'));
  style.textContent = THEME + css + tableCss;
  const m = await map(TABLET);
  const root = m.canvas.parentElement!;
  root.classList.add('atlas-vtt-plugin', 'atlas-vtt-view');
  const ui = root.createDiv({ cls: 'atlas-vtt-plugin atlas-react-ui-container' });
  Object.assign(ui.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '1000' });
  for (const selector of GM_SURFACES) {
    const surface = ui.createDiv({ cls: selector.slice(1) });
    Object.assign(surface.style, { position: 'absolute', left: '8px', top: `${8 + GM_SURFACES.indexOf(selector) * 52}px`, width: '120px', height: '44px' });
  }
  const floating = document.body.createDiv({ cls: 'atlas-portal-host' }).createDiv({ cls: 'atlas-context-menu' });
  Object.assign(floating.style, { position: 'fixed', left: '300px', top: '300px', width: '160px', height: '120px' });

  const lighting = new LightingController({
    viewport: m.viewport, app: m.app, store: m.store, eventBus: new EventEmitter(), obsApp: m.obsidian, viewId: 'table-mode',
    bounds: () => ({ x: 0, y: 0, ...TABLET }), albedo: () => null,
  });
  lighting.wire(m.tokens);
  const state = m.store.getState();
  state.setSceneLighting({ enabled: true, ambient: 1 });
  state.addWall({ type: 'door', closed: true, p1: { x: 900, y: 200 }, p2: { x: 900, y: 280 } });
  state.addLight({ x: 1000, y: 600, emission: { bright: 2, dim: 4, color: '#ffc080', intensity: 1, animation: 'none' } });
  const spy: Character = { id: 'spy', x: 480, y: 200, size: 1, imagePath: '', kind: 'character', name: 'Spy', isHidden: true };
  state.addToken(spy);
  await expect.poll(() => Object.keys(m.tokens.getTokenSprites()).length).toBe(2);
  m.store.setState({ mapLoaded: true });
  getHistoryStore(m.store)?.getState().clear();

  const mode = new TableMode({
    app: m.obsidian, root, store: m.store, settings: new SettingsService(m.obsidian),
    viewport: () => m.viewport, overlaySources: () => null, onLeafLeft: () => () => undefined,
  });
  cleanups.push(() => {
    mode.destroy();
    lighting.destroy();
    floating.parentElement?.remove();
    style.remove();
  });
  await frame();
  await frame();
  return { m, root, lighting, floating };
}

const cleanups: Array<() => void> = [];
beforeEach(() => { openContextMenuGlobal.mockClear(); });
// Registered after the harness' own: it runs first, while the map the lighting stands on is still there
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

/** The GM's overlay layers of the lighting that show something now. */
const gmOverlaysShown = (lighting: LightingController): string[] =>
  Object.entries(lighting.gmOverlays()).filter(([, layer]) => (layer as Container).visible).map(([name]) => name);

describe('Table mode on a tablet', () => {
  it('hides every surface of the GM, on the page and on the canvas, and leaves the players\' picture', async () => {
    const { m, root, lighting, floating } = await table();
    m.store.getState().setActiveTool('wall');
    m.store.getState().setSelection(['token']);
    await frame();
    // The GM's view: bars and panels around the map, the lighting's marks and the hidden token on it
    for (const selector of GM_SURFACES) expect(shown(selector), selector).toBe(true);
    expect(gmOverlaysShown(lighting)).toEqual(expect.arrayContaining(['wallEditor', 'doorBadges', 'lightMarkers']));
    expect(m.tokens.getTokenSprites()['spy']!.visible).toBe(true);

    m.store.getState().enterTableMode();
    await frame();
    await frame();

    for (const selector of GM_SURFACES) expect(shown(selector), selector).toBe(false);
    expect(floating.getBoundingClientRect().width).toBe(0);
    expect(gmOverlaysShown(lighting)).toEqual([]);
    expect(m.tokens.getTokenSprites()['spy']!.visible).toBe(false);
    expect(m.tokens.getTokenSprites()['token']!.visible).toBe(true);
    expect(m.store.getState().selectedIds).toEqual([]);
    expect(m.ring().visible).toBe(false);
    // What stays: the map's canvas, at its size, and the table's surface with one thing to press
    expect(m.canvas.getBoundingClientRect().width).toBe(TABLET.width);
    const chip = root.querySelector('.atlas-table-chip')!.getBoundingClientRect();
    expect(chip.width).toBe(44);
    expect(chip.height).toBe(44);
    expect(chip.left).toBeCloseTo(12, 0);
    expect(TABLET.height - chip.bottom).toBeCloseTo(12, 0);
    const pressable = Array.from(root.querySelectorAll<HTMLElement>('.atlas-table-surface, .atlas-table-surface *'))
      .filter((element) => getComputedStyle(element).pointerEvents !== 'none' && !element.closest('.atlas-table-chip'));
    expect(pressable).toEqual([]);
  });

  it('a finger dragged over a token pans the map and moves no token; a tap and a rest do nothing', async () => {
    const { m } = await table();
    m.store.getState().enterTableMode();
    await frame();
    const before = camera(m);

    await touch.down(TOKEN);
    await touch.glide([TOKEN], [{ x: TOKEN.x + 160, y: TOKEN.y + 80 }]);
    await touch.up();
    await rest(m);
    expect(m.tokenAt()).toEqual(TOKEN);
    expect(camera(m).x - before.x).toBeGreaterThan(130);
    expect(camera(m).y - before.y).toBeGreaterThan(55);
    expect(m.steps()).toBe(0);
    expect(m.store.getState().selectedIds).toEqual([]);
    expect(m.store.getState().isDragging).toBeFalsy();

    // The token went with the map: a tap on it selects nothing, a finger held on it opens nothing
    const token = m.viewport.toScreen(TOKEN.x, TOKEN.y);
    await touch.down(token);
    await wait(60);
    await touch.up();
    await wait(350);
    await touch.down(token);
    await wait(700);
    expect(m.ring().visible).toBe(false);
    await touch.up();
    await frame();
    expect(m.store.getState().selectedIds).toEqual([]);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    expect(m.tokenAt()).toEqual(TOKEN);
  });

  it('two fingers zoom and a double tap zooms in, as in the GM\'s view', async () => {
    const { m } = await table();
    m.store.getState().enterTableMode();
    await frame();
    const left = { x: 500, y: 400 };
    const right = { x: 700, y: 400 };
    await touch.down(left);
    await touch.down(left, right);
    await touch.glide([left, right], [{ x: 400, y: 400 }, { x: 800, y: 400 }], 10);
    await touch.up();
    await rest(m);
    const pinched = camera(m).scale;
    expect(pinched).toBeGreaterThan(1.7);

    await wait(350);
    for (let tap = 0; tap < 2; tap++) {
      await touch.down(EMPTY);
      await wait(40);
      await touch.up();
      await wait(80);
    }
    await rest(m);
    expect(camera(m).scale).toBeGreaterThan(pinched * 1.5);
    expect(m.store.getState().tableMode).not.toBeNull();
  });

  it('a mouse pans by its drag and reaches no token either', async () => {
    const { m } = await table();
    m.store.getState().enterTableMode();
    await frame();
    const before = camera(m);
    await mouse.hover(TOKEN.x, TOKEN.y);
    await mouse.click(TOKEN.x, TOKEN.y);
    await mouse.rightClick(TOKEN.x, TOKEN.y);
    await frame();
    expect(m.store.getState().selectedIds).toEqual([]);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();

    await mouse.down(TOKEN.x, TOKEN.y);
    for (let step = 1; step <= 6; step++) await mouse.move(TOKEN.x + step * 20, TOKEN.y);
    await mouse.up(TOKEN.x + 120, TOKEN.y);
    await rest(m);
    expect(m.tokenAt()).toEqual(TOKEN);
    expect(camera(m).x - before.x).toBeGreaterThan(100);
    expect(m.steps()).toBe(0);
  });

  it('the GM chip, held, gives the GM\'s view back as it was; a tap on it does nothing', async () => {
    const { m, root, lighting } = await table();
    m.store.getState().setActiveTool('wall');
    await frame();
    const before = camera(m);
    m.store.getState().enterTableMode();
    await frame();
    // The table looks around
    await touch.down(EMPTY);
    await touch.glide([EMPTY], [{ x: EMPTY.x - 200, y: EMPTY.y - 100 }]);
    await touch.up();
    await rest(m);
    expect(camera(m)).not.toEqual(before);

    const chip = centreOf(root.querySelector('.atlas-table-chip')!);
    await touch.down(chip);
    await wait(120);
    await touch.up();
    await wait(CHIP_HOLD_MS + 100);
    expect(m.store.getState().tableMode).not.toBeNull();

    await touch.down(chip);
    await wait(CHIP_HOLD_MS + 150);
    await touch.up();
    await frame();
    await frame();

    const state = m.store.getState();
    expect(state.tableMode).toBeNull();
    expect(state.isGMView).toBe(true);
    expect(state.activeTool).toBe('wall');
    expect(camera(m)).toEqual(before);
    expect(root.querySelector('.atlas-table-surface')).toBeNull();
    for (const selector of GM_SURFACES) expect(shown(selector), selector).toBe(true);
    expect(gmOverlaysShown(lighting)).toEqual(expect.arrayContaining(['wallEditor', 'doorBadges', 'lightMarkers']));
    expect(m.tokens.getTokenSprites()['spy']!.visible).toBe(true);
  });

  it('two fingers held still on the map give the GM\'s view back too, with the ring closing around them', async () => {
    const { m } = await table();
    m.store.getState().enterTableMode();
    await frame();
    const left = { x: 500, y: 400 };
    const right = { x: 600, y: 420 };
    await touch.down(left);
    await touch.down(left, right);
    await wait(PAIR_HOLD_MS / 2);
    expect(m.ring().visible).toBe(true);
    expect(m.store.getState().tableMode).not.toBeNull();
    await wait(PAIR_HOLD_MS / 2 + 150);
    expect(m.store.getState().tableMode).toBeNull();
    expect(m.ring().visible).toBe(false);
    await touch.up();
    await wait(400);
    // The lifted fingers were no tap of two: nothing was undone, and the GM's tools are back
    expect(m.steps()).toBe(0);
    await mouse.click(TOKEN.x, TOKEN.y);
    await frame();
    expect(m.store.getState().selectedIds).toEqual(['token']);
  });
});
