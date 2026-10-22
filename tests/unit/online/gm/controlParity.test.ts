import fs from 'node:fs';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import { shapeOf, visibleResources } from '../../../../src/app/resources/visibleResources';
import type { TokenEntity } from '../../../../src/app/types';
import type { GridState } from '../../../../src/app/types/gridTypes';
import type { SceneLightingChanges } from '../../../../src/app/types/lightingTypes';
import type { TokenUpdates } from '../../../../src/app/types/viewState';
import { describe, expect, it } from 'vitest';
import { TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { CONDITIONS, creature, gm, type ControlStoreFactory, GRID, RESOURCES } from './controlHarness.ts';
import { STORE_FACTORY } from './realStore.ts';
import { sequenced, tokenLists, type ShareHarness } from './shareHarness.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: ControlStoreFactory };

/**
 * Every GM control that changes what Atlas's player window shows, written through Atlas's own view
 * store and settings, and what the players' browsers are sent after it. Atlas's player window is the
 * spec: it is a capture of the GM's canvas with the players' layers (`withPlayerSafeFrame`), so
 * - the grid shows exactly as the GM sets it, hidden included (the capture lists no grid layer, so it
 *   takes the GM's grid as it is);
 * - nameplates show by the player view's Show nameplates alone (`TokenUIRenderer.update` with player
 *   settings; the map's and the token's own nameplate switches decide only the GM's canvas);
 * - bars are the resources `visibleToPlayers` in bar sockets (`visibleResources(…, 'player')`; the
 *   map's hidden resources decide only the GM's canvas); the player window also shows the wheels
 *   players see, at rest, which the companion does not send yet;
 * - everything else is the scene as the store holds it.
 * Settings change without a store write, so players must get them within the companion's poll.
 */

const vendor = (file: string): string => fs.readFileSync(new URL(`../../../../src/app/${file}`, import.meta.url), 'utf8');

/** Everything sent from `from` on, as text. */
const sentSince = (table: ShareHarness, from: number): string => table.sent.slice(from).map(({ body }) => JSON.stringify(body)).join('\n');

describe("the grid: Atlas's player window shows it as the GM sets it", () => {
  it('takes the players\' grid away while the GM hides his, and brings it back with his', async () => {
    const { store, settle, grid } = await gm(createViewAtlasStore);
    const shown = grid();
    expect(shown).toMatchObject({ type: 'square', size: 70, alpha: 0.7 });
    store.getState().setGridVisible(false);
    await settle(TOKEN_POLL_MS);
    expect(grid()).toBeNull();
    store.getState().setGridVisible(true);
    await settle(TOKEN_POLL_MS);
    expect(grid()).toEqual(shown);
  });

  it('draws what the GM sets: type, size, offsets, colour, opacity, line width and style, cell numbers and their opacity, and snaps players to it', async () => {
    const { store, table, settle, grid } = await gm(createViewAtlasStore);
    store.getState().setGrid({ ...GRID, type: 'hex-vertical', size: 84, offsetX: 12, offsetY: -7, color: '#ff8800', opacity: 0.35, lineWidth: 3, lineType: 'dashed', cellNumbers: 'letter-number', cellNumberOpacity: 0.4 });
    await settle();
    expect(grid()).toEqual({ type: 'hex-vertical', size: 84, offsetX: 12, offsetY: -7, colour: '#ff8800', alpha: 0.35, lineWidth: 3, lineType: 'dashed', numbers: { format: 'letter-number', opacity: 0.4 } });
    expect(tokenLists(table.sent).at(-1)?.snap).toEqual({ type: 'hex-vertical', size: 84, offsetX: 12, offsetY: -7 });
    store.getState().setGrid({ ...store.getState().grid as GridState, snapToGrid: false });
    await settle();
    expect(tokenLists(table.sent).at(-1)?.snap).toBeNull();
  });
});

describe("token nameplates: Atlas's player window shows them by the player view's Show nameplates alone", () => {
  it("leaves players' tokens alone when the GM shows the map's nameplates or one token's own, and follows Show nameplates, without a store write", async () => {
    const { store, table, settle, tokens } = await gm(createViewAtlasStore);
    expect(tokens().get('ogre')).toMatchObject({ name: null, ui: { nameplate: false } });
    const before = table.sent.length;
    const list = JSON.stringify([...tokens()]);
    store.getState().setTokenSettings({ ...store.getState().tokenSettings, showNameplates: true });
    store.getState().updateTokens([{ id: 'ogre', changes: { showNameplate: true } }]);
    await settle(TOKEN_POLL_MS);
    expect(JSON.stringify([...tokens()])).toBe(list);
    expect(sentSince(table, before)).not.toContain('Name-of-');
    table.settings = { ...table.settings, showNames: true };
    await settle(TOKEN_POLL_MS);
    for (const id of ['ogre', 'bear']) expect(tokens().get(id)).toMatchObject({ name: `Name-of-${id}`, ui: { nameplate: true } });
    table.settings = { ...table.settings, showNames: false };
    await settle(TOKEN_POLL_MS);
    expect(tokens().get('bear')).toMatchObject({ name: null, ui: { nameplate: false } });
  });
});

describe("token bars: Atlas's player window shows the resources players may see, in bar sockets", () => {
  it("leaves players' bars alone when the GM hides a bar on his map, and follows each resource's Show to players, without a store write", async () => {
    const { store, table, settle, tokens } = await gm(createViewAtlasStore);
    const bars = (): unknown => tokens().get('ogre')?.ui?.bars.map(({ colour, current, max }) => [colour, current, max]);
    const atlasBars = (resources: readonly ResourceDefinition[]): unknown => {
      const ogre = store.getState().objects.tokens.ogre as TokenEntity;
      return visibleResources(ogre, resources, 'player').filter(({ slot }) => shapeOf(slot) === 'bar').map(({ definition, value }) => [definition.color, value.current, value.max]);
    };
    expect(bars()).toEqual([['#dc2626', 13, 31]]);
    expect(bars()).toEqual(atlasBars(RESOURCES));
    const before = table.sent.length;
    store.getState().setTokenSettings({ ...store.getState().tokenSettings, hiddenResources: ['hp'] });
    await settle(TOKEN_POLL_MS);
    expect(bars()).toEqual(atlasBars(RESOURCES));
    expect(sentSince(table, before)).not.toContain('47');
    // The player view's switches write `visibleToPlayers` into the collection's settings.
    const flipped = RESOURCES.map((definition) => ({ ...definition, visibleToPlayers: !definition.visibleToPlayers }));
    table.rules = { resources: flipped, conditions: CONDITIONS };
    await settle(TOKEN_POLL_MS);
    expect(bars()).toEqual([['#0ea5e9', 41, 47]]);
    expect(bars()).toEqual(atlasBars(flipped));
  });
});

describe('the rest of a token, as the scene holds it', () => {
  it("follows the map's instance badges, a token's ring, colour, size, rotation, conditions and values, and leaves a hidden token out", async () => {
    const { store, table, settle, tokens } = await gm(createViewAtlasStore, [creature('ogre1', 105, { imagePath: 'art/ogre.webp', instanceNumber: 1 }), creature('ogre2', 245, { imagePath: 'art/ogre.webp', instanceNumber: 2 })]);
    expect([tokens().get('ogre1')?.badge, tokens().get('ogre2')?.badge]).toEqual([1, 2]);
    store.getState().setTokenSettings({ ...store.getState().tokenSettings, showInstanceBadges: false });
    await settle();
    expect([tokens().get('ogre1')?.badge, tokens().get('ogre2')?.badge]).toEqual([null, null]);
    const changes: TokenUpdates = { ringColor: '#336699', size: 2, rotation: 90, conditions: ['frightened'], conditionValues: { frightened: 3 }, resources: { hp: { current: 5, max: 31 }, str: { current: 41, max: 47 } } };
    store.getState().updateTokens([{ id: 'ogre1', changes }]);
    await settle();
    const ogre = tokens().get('ogre1');
    expect(ogre).toMatchObject({ cells: 2, rotation: 90, ring: { colour: '#336699' } });
    expect(ogre?.ui?.conditions).toEqual([{ colour: '#a855f7', glyph: { kind: 'text', text: 'F' }, value: 3 }]);
    expect(ogre?.ui?.bars[0]).toMatchObject({ current: 5, max: 31 });
    store.getState().updateTokens([{ id: 'ogre1', changes: { showRing: false } }]);
    await settle();
    expect(tokens().get('ogre1')?.ring).toBeNull();
    const before = table.sent.length;
    store.getState().updateTokens([{ id: 'ogre2', changes: { isHidden: true, name: 'Secret-twin' } }]);
    await settle(TOKEN_POLL_MS);
    expect(tokens().has('ogre2')).toBe(false);
    expect(sentSince(table, before)).not.toContain('Secret-twin');
  });
});

describe('scene lighting options', () => {
  it("reach the players' sight as the scene holds them", async () => {
    const { store, table, settle } = await gm(createViewAtlasStore, [creature('hero', 105, { vision: { enabled: true } })]);
    const changes: SceneLightingChanges = { enabled: true, ambient: 0.2, exploredColor: '#336699', unexploredColor: '#101010', darkSightLook: 'grey', litThreshold: 0.3, tokenVision: true, exploredMemory: false };
    store.getState().setSceneLighting(changes);
    await settle(TOKEN_POLL_MS);
    const sight = sequenced(table.sent, 'sight').at(-1);
    expect(sight?.lighting).toEqual(store.getState().lighting);
    expect(sight?.lighting).toMatchObject(changes);
  });
});

describe("Atlas's player window rules, read from its source at the pin", () => {
  it('captures the grid as the GM has it: no grid layer in the capture, hidden while the GM hides it', () => {
    const orchestrator = vendor('PixiRendererOrchestrator.ts');
    const capture = /public withPlayerSafeFrame\([\s\S]*?\n {2}\}\n/.exec(orchestrator)?.[0] ?? '';
    expect(capture).toContain('this.playerFrameLayers(settings)');
    const layers = /private playerFrameLayers\([\s\S]*?\n {2}\}\n/.exec(orchestrator)?.[0] ?? '';
    expect(layers).toContain('return layers;');
    expect(`${capture}${layers}`).not.toMatch(/getGridSprite|showGrid/);
    const grid = vendor('grid/GridSystem.ts');
    expect(grid).toContain('grid.visible = this.options.enabled !== false;');
    expect(grid).toMatch(/public setEnabled\(enabled: boolean\): void \{\s*this\.options\.enabled = enabled;\s*if \(enabled\) \{\s*this\.createGrid\(\);\s*\} else if \(this\.gridSprite\) \{\s*this\.gridSprite\.visible = false;\s*\}/);
  });

  it("draws players' nameplates by Show nameplates alone and their bars by the resources they may see, never the map's hidden ones", () => {
    const ui = vendor('pixi/TokenUIRenderer.ts');
    expect(ui).toContain('const forPlayers = playerSettings !== undefined || this.playersView;');
    expect(ui).toContain("const viewer: ResourceViewer = forPlayers ? 'player' : 'dm';");
    expect(ui).toContain('const hidden = forPlayers ? [] : tokenSettings?.hiddenResources ?? [];');
    expect(ui).toContain('const showNameplate = playerSettings ? playerSettings.showTokenNameplates : isNameplateVisible(');
    expect(vendor('pixi/token-renderer/UIManager.ts')).toContain('ui.update(token, sprite.tokenSize || 70, settings);');
  });
});
