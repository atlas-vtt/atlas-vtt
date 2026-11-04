import { describe, expect, it, vi } from 'vitest';
import type { ViewAtlasState, ViewAtlasStore } from '../../../storeFactory';
import { captureWithLayerVisibility, type HideableLayer, type LayerVisibility } from '../../playerSafeFrame';
import { playerLightingLayers, type GmOverlays } from '../playerLightingLayers';
import { SessionLighting } from '../SessionLighting';

interface Setup {
  session: SessionLighting;
  modeLayer: HideableLayer;
  gm: GmOverlays;
  /** What a player frame changes, read anew: the list session view must hold. */
  playerLayers: () => LayerVisibility[];
  setGMView: (on: boolean) => void;
  /** The GM picks or leaves the lighting tool, whose editor is then his to see. */
  setTool: (on: boolean) => void;
  onChange: ReturnType<typeof vi.fn>;
}

function setup(): Setup {
  const listeners = new Set<(state: ViewAtlasState, previous: ViewAtlasState) => void>();
  let state = { isGMView: true } as ViewAtlasState;
  const store = {
    getState: () => state,
    subscribe: (listener: (state: ViewAtlasState, previous: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)),
  } as unknown as ViewAtlasStore;
  const modeLayer: HideableLayer = { visible: false };
  const gm: GmOverlays = { wallEditor: { visible: false }, lightZones: { visible: false }, levelSurfaces: { visible: false }, exploredMemory: { visible: false }, doorBadges: { visible: false }, lightMarkers: { visible: false }, rangeRings: { visible: false }, sightAids: { visible: false } };
  let tool = false;
  const playerLayers = (): LayerVisibility[] => playerLightingLayers({ enabled: true, modeLayer, gmOverlays: gm });
  const onChange = vi.fn();
  const session = new SessionLighting({
    store,
    playerLayers,
    gmLayers: () => [
      { layer: modeLayer, visible: false },
      { layer: gm.wallEditor, visible: tool },
      { layer: gm.doorBadges, visible: true },
      { layer: gm.lightMarkers, visible: !tool },
    ],
    onChange,
  });
  session.sync();
  return {
    session,
    modeLayer,
    gm,
    playerLayers,
    setGMView: (on) => {
      const previous = state;
      state = { ...state, isGMView: on };
      listeners.forEach((listener) => listener(state, previous));
    },
    setTool: (on) => {
      tool = on;
      session.sync();
    },
    onChange,
  };
}

function expectHeld(layers: LayerVisibility[]): void {
  expect(layers.length).toBeGreaterThan(0);
  for (const { layer, visible } of layers) expect(layer.visible).toBe(visible);
}

describe('SessionLighting', () => {
  it('leaves the GM his own layers in GM view', () => {
    const { session, modeLayer, gm } = setup();
    expect(session.active).toBe(false);
    expect(modeLayer.visible).toBe(false);
    expect(gm.wallEditor.visible).toBe(false);
    expect(gm.doorBadges.visible).toBe(true);
    expect(gm.lightMarkers.visible).toBe(true);
  });

  it('holds in session view every change a player frame makes', () => {
    const { session, playerLayers, setGMView } = setup();
    setGMView(false);
    expect(session.active).toBe(true);
    expectHeld(playerLayers());
  });

  it('keeps them held when the GM picks the lighting tool in session view', () => {
    const { gm, playerLayers, setGMView, setTool } = setup();
    setGMView(false);
    setTool(true);
    expect(gm.wallEditor.visible).toBe(false);
    expectHeld(playerLayers());
  });

  it('gives the GM his layers back with GM view, as the tool now wants them', () => {
    const { modeLayer, gm, setGMView, setTool } = setup();
    setGMView(false);
    setTool(true);
    setGMView(true);
    expect(modeLayer.visible).toBe(false);
    expect(gm.wallEditor.visible).toBe(true);
    expect(gm.doorBadges.visible).toBe(true);
    expect(gm.lightMarkers.visible).toBe(false);
  });

  it('shows the same while the peek key is held', () => {
    const { session, gm, playerLayers } = setup();
    session.setPeeking(true);
    expect(session.active).toBe(true);
    expectHeld(playerLayers());
    session.setPeeking(false);
    expect(session.active).toBe(false);
    expect(gm.doorBadges.visible).toBe(true);
  });

  it('stays in the players\' view when the peek key is released in session view', () => {
    const { session, playerLayers, setGMView } = setup();
    setGMView(false);
    session.setPeeking(true);
    session.setPeeking(false);
    expect(session.active).toBe(true);
    expectHeld(playerLayers());
  });

  it('lets a player frame be captured in session view and is still held afterwards', () => {
    const { playerLayers, setGMView } = setup();
    setGMView(false);
    const playerUi: HideableLayer = { visible: false };
    const render = vi.fn();
    const seen: boolean[] = [];
    captureWithLayerVisibility([...playerLayers(), { layer: playerUi, visible: true }], render, () => {
      seen.push(playerUi.visible, ...playerLayers().map(({ layer, visible }) => layer.visible === visible));
    });
    expect(seen.every(Boolean)).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
    expect(playerUi.visible).toBe(false);
    expectHeld(playerLayers());
  });

  it('reports every change of view', () => {
    const { session, setGMView, onChange } = setup();
    onChange.mockClear();
    setGMView(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    session.setPeeking(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('stops following the store once destroyed', () => {
    const { session, modeLayer, setGMView } = setup();
    session.destroy();
    setGMView(false);
    expect(modeLayer.visible).toBe(false);
  });
});
