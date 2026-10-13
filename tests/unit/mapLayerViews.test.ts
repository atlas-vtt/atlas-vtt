import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { DrawingLayer } from '../../src/app/pixi/drawingLayer';
import { DoorIcons, type DoorIconsState } from '../../src/app/pixi/lighting/DoorIcons';
import { createTextElementView, TEXT_CONTENT_LABEL, updateTextElementView } from '../../src/app/pixi/textElementView';
import { entryTokenOf, listedForPlayers, playerInitiativeList, renderPlayerInitiative, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import type { DrawingStroke, TextElement, TokenEntity } from '../../src/app/types';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import { DEFAULT_SCENE_LIGHTING } from '../../src/app/types/lightingTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

vi.mock('../../src/app/pixi/utils/lucideIconTexture', async () => {
  const { Texture, TextureSource } = await import('pixi.js');
  return { createLucideIconTexture: async (): Promise<Texture> => new Texture({ source: new TextureSource({ width: 96, height: 96 }) }) };
});

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function stroke(id: string, x: number): DrawingStroke {
  return { id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x, y: 0 }, { x: x + 10, y: 10 }], color: '#ff0000', width: 4, opacity: 1 };
}

describe('the drawing layer', () => {
  it('keeps one node per drawing, reuses it while the record is unchanged and removes what is gone', () => {
    const container = new Container();
    const layer = new DrawingLayer(container);
    const a = stroke('a', 0);
    layer.sync({ a, b: stroke('b', 50) });
    expect(container.children).toHaveLength(2);
    const first = container.children[0];
    layer.sync({ a });
    expect(container.children).toEqual([first]);
    layer.sync({ a: { ...a, color: '#00ff00' } });
    expect(container.children).toEqual([first]);
    layer.sync({ a, icon: { ...stroke('icon', 20), type: 'icon', icon: 'skull', points: [{ x: 20, y: 30 }], width: 40 } });
    expect(container.children).toHaveLength(2);
    expect(container.children[1]?.position).toMatchObject({ x: 20, y: 30 });
    layer.destroy();
  });
});

describe('a text view', () => {
  const element: TextElement = { id: 't', kind: 'text', x: 100, y: 50, text: 'Gate', fontSize: 24, fontFamily: 'serif', color: '#ffffff', rotation: 90, scale: 2 };

  it('draws a text at its place, turned and scaled, and follows its edits', () => {
    cleanup = stubJsdomGraphics();
    const view = createTextElementView(element);
    expect(view.label).toBe('t');
    expect(view.position).toMatchObject({ x: 100, y: 50 });
    expect(view.rotation).toBeCloseTo(Math.PI / 2);
    expect(view.scale.x).toBe(2);
    updateTextElementView(view, { ...element, text: 'Door', x: 10, rotation: undefined, scale: undefined });
    expect((view.getChildByLabel(TEXT_CONTENT_LABEL) as Text).text).toBe('Door');
    expect(view.position.x).toBe(10);
    expect(view.rotation).toBe(0);
    expect(view.scale.x).toBe(1);
  });
});

describe('door badges from a narrow source', () => {
  it('draw the players a badge on each door they see, without a store of a whole view', () => {
    const restore = stubJsdomGraphics();
    const door: WallSegment = { id: 'door', kind: 'wall', type: 'door', p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, closed: true };
    const store = createStore<DoorIconsState>(() => ({
      grid: null, lighting: { ...DEFAULT_SCENE_LIGHTING }, mapPath: 'maps/a.atlasmap',
      objects: { walls: { door }, fog: {} }, toggleDoor: () => undefined,
    }));
    const icons = new DoorIcons(store, document.createElement('canvas'), () => new Set(['door']));
    cleanup = () => {
      icons.destroy();
      restore();
    };
    icons.playerView.visible = true;
    expect(icons.playerView.children.some((child) => child instanceof Graphics)).toBe(true);
    icons.view.visible = false;
    expect(icons.hitTest(50, 100)).toBe('door');
  });
});

describe("the players' initiative list", () => {
  const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
  const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'opponents' };
  const entry = (tokenId: string, order: number, initiative: number): PlayerInitiativeEntry => ({ tokenId, name: tokenId, initiative, isActive: order === 0, imagePath: '', order });
  const tokens: Record<string, TokenEntity> = {
    hero: { id: 'hero', kind: 'token', x: 0, y: 0, imagePath: '', vision: { enabled: true }, resources: { hp: { current: 4, max: 10 } } },
    ogre: { id: 'ogre', kind: 'token', x: 0, y: 0, imagePath: '' },
    spy: { id: 'spy', kind: 'token', x: 0, y: 0, imagePath: '', isHidden: true },
  };
  const entries = [entry('ogre', 1, 12), entry('spy', 2, 9), entry('hero', 0, 18)];
  const tokenOf = (listed: PlayerInitiativeEntry): ReturnType<typeof entryTokenOf> | null =>
    (listedForPlayers(tokens[listed.tokenId]) ? entryTokenOf(tokens[listed.tokenId]) : null);

  it('lists every combatant whose token is not hidden, in turn order, with hit points only where shown', () => {
    const fight = { entries, isActive: true, round: 3 };
    const list = playerInitiativeList(fight, tokenOf, TURN_ORDER, false);
    expect(list.combatants.map(({ entry: listed }) => listed.tokenId)).toEqual(['hero', 'ogre']);
    expect(list.combatants[0]?.token).toMatchObject({ hp: null, side: 'players' });
    expect(playerInitiativeList(fight, tokenOf, TURN_ORDER, true).combatants[0]?.token.hp).toEqual({ current: 4, max: 10 });
    expect(list).toMatchObject({ bySides: false, round: 3, activeSide: null });
  });

  it('groups by side as a fight by sides runs, or as the rules say without one', () => {
    expect(playerInitiativeList({ entries, isActive: false, round: 0 }, tokenOf, SIDES, false)).toMatchObject({ bySides: true, firstSide: 'opponents' });
    const running = { entries, isActive: true, round: 1, sides: { first: 'players' as const, active: 'opponents' as const } };
    expect(playerInitiativeList(running, tokenOf, TURN_ORDER, false)).toMatchObject({ bySides: true, firstSide: 'players', activeSide: 'opponents' });
  });

  it('draws the turn, the round and names only where they are shown', () => {
    const container = createDiv();
    const list = playerInitiativeList({ entries, isActive: true, round: 2 }, tokenOf, TURN_ORDER, true);
    renderPlayerInitiative(container, list, { showNames: false, portraitSrc: () => null });
    expect(container.querySelectorAll('.atlas-player-initiative__card')).toHaveLength(2);
    expect(container.querySelector('.atlas-player-initiative__card--active')?.textContent).toContain('18');
    expect(container.querySelector('.atlas-player-initiative__name')).toBeNull();
    expect(container.querySelector('.atlas-player-initiative__round')?.textContent).toContain('2');
    expect(container.querySelector('progress')?.getAttribute('value')).toBe('4');
    const empty = createDiv();
    renderPlayerInitiative(empty, { ...list, combatants: [] }, { showNames: true, portraitSrc: () => null });
    expect(empty.childElementCount).toBe(0);
  });
});
