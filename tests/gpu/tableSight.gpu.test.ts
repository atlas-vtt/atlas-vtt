import { referenceEngine } from '../helpers/tableSightReference';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { describe, expect, it } from 'vitest';
import { playerDoorSight, playerTokenSight } from '../../src/app/pixi/lighting/playerLightingLayers';
import { heldForSight, holdTokens } from '../../src/app/lighting/sightOnDrop';
import { byteDifferences, rgb, tableScenes, visionToken } from '../helpers/tableSightScene';

describe('table sight through the lighting renderer', () => {
  const { scene } = tableScenes();

  it.each(['normal', 'darkvision', 'blindsight', 'truesight'].flatMap(sense => [false, true].map(mixed => ({ sense, mixed }))))('preserves the exact GM frame for a hidden $sense source (mixed=$mixed)', async ({ sense, mixed }) => {
    const hidden = visionToken('hidden', 190, true);
    if (sense !== 'normal') hidden.vision = { enabled: true, range: 5, senses: [{ id: sense, range: 5 }] };
    if (sense === 'truesight') hidden.light = { bright: 0, dim: 5, color: '#ffffff', intensity: 1, animation: 'none', darkness: true };
    const h = await scene({ tokens: { ...(mixed ? { party: visionToken('party', 60) } : {}), hidden }, lighting: { ambient: sense === 'normal' ? 1 : 0, exploredMemory: false } });
    const reference = referenceEngine(h.renderer, h.store.getState());
    try {
      const original = h.reference(reference);
      expect(byteDifferences(original, h.pixels('gm'))).toBe(0);
      for (let i = 0; i < 3; i++) {
        const players = h.pixels('player');
        expect(byteDifferences(original, h.thumbnail())).toBe(0);
        expect(byteDifferences(players, h.pixels('player'))).toBe(0);
        expect(byteDifferences(original, h.pixels('gm'))).toBe(0);
      }
    } finally { reference.destroy(); }
  });

  it('matches the frozen visible-only player frame across every pixel in a mixed scene', async () => {
    const h = await scene({ tokens: { party: visionToken('party', 60), hidden: visionToken('hidden', 190, true) }, lighting: { exploredMemory: false } });
    const state = h.store.getState();
    const hidden = state.objects.tokens.hidden!;
    const reference = referenceEngine(h.renderer, { ...state, objects: { ...state.objects,
      tokens: { ...state.objects.tokens, hidden: { ...hidden, vision: { enabled: false } } },
    } });
    try {
      reference.setMode('player');
      expect(byteDifferences(h.reference(reference), h.pixels('player'))).toBe(0);
    } finally { reference.destroy(); }
  });

  it('keeps a hidden sole source, its room and its door out of the player picture', async () => {
    const h = await scene({ tokens: { hidden: visionToken('hidden', 190, true) } });
    expect(rgb(h.pixels('player'), 190, 128)).toEqual([0, 0, 0]);
    expect(playerDoorSight(h.lighting, h.store.getState().objects.walls).size).toBe(0);
    expect(playerTokenSight(h.lighting, h.store.getState().objects.tokens)?.('hidden')).toBe('unseen');
    expect(h.lighting.currentSight().regions).toHaveLength(0);
    expect(h.lighting.currentSight().all).toBe(false);
  });

  it('removes hidden sight in a mixed scene while retaining the visible room', async () => {
    const h = await scene({ tokens: { party: visionToken('party', 60), hidden: visionToken('hidden', 190, true) } });
    const pixels = h.pixels('player');
    expect(rgb(pixels, 60, 128)).toEqual([86, 144, 198]);
    expect(rgb(pixels, 190, 128)).toEqual([0, 0, 0]);
    expect(playerDoorSight(h.lighting, h.store.getState().objects.walls).size).toBe(0);
  });

  it('keeps the no-vision fallback and the disabled token-vision picture open', async () => {
    const h = await scene({ tokens: {}, lighting: { exploredMemory: false } });
    const noVision = h.pixels('player');
    expect(rgb(noVision, 190, 128)).toEqual([86, 144, 198]);
    h.store.getState().setSceneLighting({ tokenVision: false });
    h.store.getState().addToken(visionToken('hidden', 190, true));
    expect(byteDifferences(noVision, h.pixels('player'))).toBe(0);
    expect(playerTokenSight(h.lighting, h.store.getState().objects.tokens)?.('hidden')).toBe('unseen');
  });

  it('updates hide and reveal immediately and keeps frame toggles stable', async () => {
    const h = await scene({ tokens: { party: visionToken('party', 190) }, lighting: { exploredMemory: false } });
    const visible = h.pixels('player');
    h.store.getState().updateToken('party', { isHidden: true });
    const hidden = h.pixels('player');
    expect(rgb(hidden, 190, 128)).toEqual([0, 0, 0]);
    for (let i = 0; i < 3; i++) {
      h.pixels('gm');
      expect(byteDifferences(hidden, h.pixels('player'))).toBe(0);
    }
    h.store.getState().updateToken('party', { isHidden: false });
    expect(byteDifferences(visible, h.pixels('player'))).toBe(0);
  });

  it.each(['darkvision', 'blindsight'])('keeps hidden %s out of the player picture', async (sense) => {
    const hidden = visionToken('hidden', 190, true);
    hidden.vision = { enabled: true, range: 5, senses: [{ id: sense, range: 5 }] };
    const h = await scene({ tokens: { hidden }, lighting: { ambient: 0, exploredMemory: false } });
    expect(rgb(h.pixels('player'), 190, 128)).toEqual([0, 0, 0]);
    expect(h.lighting.currentSight().regions).toHaveLength(0);
  });

  it.each([false, true])('preserves carried light or darkness when its token is hidden (darkness=%s)', async (darkness) => {
    const carrier = visionToken('carrier', 190);
    carrier.light = { bright: 3, dim: 5, color: '#ffffff', intensity: 1, animation: 'none', darkness };
    const observer = visionToken('observer', 180);
    observer.vision = { enabled: true, range: 5, senses: [{ id: 'truesight', range: 5 }] };
    const h = await scene({ tokens: { carrier, observer }, lighting: { ambient: 0, exploredMemory: false } });
    const reaches = h.lighting.lightReaches();
    const lit = h.pixels('player');
    h.store.getState().updateToken('carrier', { isHidden: true });
    expect(h.lighting.lightReaches()).toEqual(reaches);
    expect(rgb(h.pixels('player'), 190, 128)).toEqual(rgb(lit, 190, 128));
    expect(playerTokenSight(h.lighting, h.store.getState().objects.tokens)?.('carrier')).toBe('unseen');
  });

  it.each([false, true])('does not open the map for a blind or pending visible source (pending=%s)', async (pending) => {
    const party = visionToken('party', 60);
    party.conditions = ['blind'];
    const h = await scene({ tokens: { party }, lighting: { exploredMemory: false }, rules: {
      definitions: GENERIC_SENSES,
      conditions: [{ id: 'blind', name: 'Blind', color: '#ffffff', effect: 'blinded' }],
      ...(pending ? { visionOf: () => ({ senses: [], pending: true }) } : {}),
    } });
    expect(rgb(h.pixels('player'), 190, 128)).toEqual([0, 0, 0]);
    h.store.getState().updateToken('party', { isHidden: true });
    expect(rgb(h.pixels('player'), 60, 128)).toEqual([0, 0, 0]);
  });

  it('reads movement live when sight on drop is off, but ignores hidden movement', async () => {
    const h = await scene({ lighting: { sightOnDrop: false, exploredMemory: false } });
    holdTokens(h.store, ['party']);
    h.store.getState().moveToken('party', 190, 128);
    expect(rgb(h.pixels('player'), 190, 128)).toEqual([86, 144, 198]);
    h.store.getState().updateToken('party', { isHidden: true });
    expect(rgb(h.pixels('player'), 190, 128)).toEqual([0, 0, 0]);
  });

  it('keeps a held source at its starting sight until the drop and never shows a hidden held token', async () => {
    const h = await scene({ lighting: { exploredMemory: false } });
    holdTokens(h.store, ['party']);
    h.store.getState().moveToken('party', 190, 128);
    expect(rgb(h.pixels('player'), 190, 128)).toEqual([0, 0, 0]);
    let state = h.store.getState();
    expect(playerTokenSight(h.lighting, state.objects.tokens, { held: heldForSight(state) })?.('party')).toBe('unseen');
    h.store.getState().updateToken('party', { isHidden: true });
    state = h.store.getState();
    expect(playerTokenSight(h.lighting, state.objects.tokens, { held: heldForSight(state) })?.('party')).toBe('unseen');
    holdTokens(h.store, []);
    expect(rgb(h.pixels('player'), 190, 128)).toEqual([0, 0, 0]);
    h.store.getState().updateToken('party', { isHidden: false });
    expect(rgb(h.pixels('player'), 190, 128)).toEqual([86, 144, 198]);
  });
});
