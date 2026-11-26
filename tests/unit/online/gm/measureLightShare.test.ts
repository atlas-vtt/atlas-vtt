import { describe, expect, it } from 'vitest';
import { MARKS_INTERVAL_MS, parseSight, type SharedSight } from '../../../../src/app/online/protocol/index.ts';
import { INPUT_INTERVAL_MS } from '../../../../src/app/online/gm/InputShare.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { KeptMeasure } from '../../../../src/app/measure/measureTypes';
import type { LightEmission } from '../../../../src/app/types/lightingTypes';
import { sceneState, sequenced, shareHarness, token, type ShareHarness } from './shareHarness.ts';

const PLAYER = 'a'.repeat(20);
const PNG_1000x800 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x03, 0xe8, 0, 0, 0x03, 0x20, 8, 6]);
const FIRE: LightEmission = { bright: 10, dim: 20, color: '#ff7a2a', intensity: 1, animation: 'torch' };

const kept = (id: string, changes: Partial<KeptMeasure> = {}): KeptMeasure => ({ id, kind: 'measure', shape: 'circle', points: [{ x: 300, y: 300 }, { x: 440, y: 300 }], ...changes });

function lit(measures: Record<string, KeptMeasure>, tokens: SceneState['objects']['tokens'] = {}): SceneState {
  return sceneState({
    background: 'maps/cave.png', lighting: { enabled: true, ambient: 0.1 }, grid: { type: 'square', size: 70, offsetX: 0, offsetY: 0 } as SceneState['grid'],
    objects: { ...sceneState().objects, tokens, measures },
  });
}

async function shared(initial: SceneState): Promise<ShareHarness> {
  const share = shareHarness(initial, new Map([['maps/cave.png', PNG_1000x800]]));
  share.share.start();
  await share.set(initial);
  await share.advance(INPUT_INTERVAL_MS);
  return share;
}

/** Sets the scene and lets the next sight go out. */
async function next(share: ShareHarness, state: SceneState): Promise<void> {
  await share.set(state);
  await share.advance(INPUT_INTERVAL_MS);
}

/** The sight players hold now, every delta applied and read as their page reads it. */
function sight(share: ShareHarness): SharedSight {
  const last = sequenced(share.sent, 'sight').at(-1);
  if (last === undefined) throw new Error('no sight was sent');
  const read = parseSight(JSON.parse(JSON.stringify(last)) as Record<string, unknown>);
  if (read === null) throw new Error('the sight players were sent cannot be read');
  return read;
}

describe('the light of a kept area reaches online players', () => {
  it('as a light of the lit scene, told again when it is switched on, moved and switched off', async () => {
    const share = await shared(lit({ fire: kept('fire') }));
    expect(sight(share).lights).toEqual([]);
    await next(share, lit({ fire: kept('fire', { light: FIRE, color: '#3366ff' }) }));
    expect(sight(share).lights).toEqual([expect.objectContaining({ x: 300, y: 300, emission: expect.objectContaining({ bright: 10, dim: 20, color: '#3366ff' }) })]);
    await next(share, lit({ fire: kept('fire', { light: FIRE, points: [{ x: 500, y: 400 }, { x: 640, y: 400 }] }) }));
    expect(sight(share).lights).toEqual([expect.objectContaining({ x: 500, y: 400 })]);
    await next(share, lit({ fire: kept('fire') }));
    expect(sight(share).lights).toEqual([]);
  });

  it('of an area only the GM sees too: the GM hid the mark, not the fire', async () => {
    const share = await shared(lit({ fire: kept('fire', { light: FIRE, hidden: true }) }));
    expect(sight(share).lights).toHaveLength(1);
  });

  it('with the outline it glows from, for a square and a line', async () => {
    const share = await shared(lit({
      square: kept('square', { shape: 'square', light: FIRE }),
      wall: kept('wall', { shape: 'line', width: 70, light: FIRE }),
    }));
    const [square, wall] = sight(share).lights;
    expect(square).toMatchObject({ x: 370, y: 300, area: [300, 230, 300, 370, 440, 370, 440, 230] });
    expect(wall?.area).toHaveLength(8);
    expect(wall).toMatchObject({ x: 370, y: 300 });
  });

  it('of an aura on the token it lies around, by the id that token has among the sight\'s tokens, and with it wherever it goes', async () => {
    const aura = kept('aura', { light: FIRE, follows: 'hero', aura: 10 });
    const share = await shared(lit({ aura }, { hero: token('hero', { x: 105, y: 105 }) }));
    const first = sight(share);
    expect(first.tokens).toHaveLength(1);
    expect(first.lights).toEqual([expect.objectContaining({ x: 105, y: 105, token: first.tokens[0]?.id })]);
    await next(share, lit({ aura }, { hero: token('hero', { x: 245, y: 175 }) }));
    expect(sight(share).lights).toEqual([expect.objectContaining({ x: 245, y: 175, token: first.tokens[0]?.id })]);
    // A hidden token's aura gives players no light, as the light it carries gives none.
    await next(share, lit({ aura }, { hero: token('hero', { x: 245, y: 175, isHidden: true }) }));
    expect(sight(share)).toMatchObject({ lights: [], tokens: [] });
  });
});

describe('a player\'s measurement gives no light', () => {
  it('whatever its message says: nothing of it is a light of the scene, and nothing of it goes on', async () => {
    const share = await shared(lit({}, { hero: token('hero', { x: 105, y: 105 }) }));
    const scene = sequenced(share.sent, 'sight').at(-1)?.scene ?? '';
    const before = share.sent.length;
    const burst = { shape: 'circle', pts: [300, 300, 440, 300], effect: 'fire', color: '#ec7500', light: FIRE, aura: { token: sight(share).tokens[0]?.id, reach: 30 } };
    share.share.receive(PLAYER, { t: 'measure', scene, color: '#66ffa9', live: null, kept: [], light: FIRE, full: { live: null, kept: [burst] } });
    await share.advance(Math.max(INPUT_INTERVAL_MS, MARKS_INTERVAL_MS));
    const sent = share.sent.slice(before).map(({ body }) => body);
    expect(sent.map((body) => body.t)).toEqual(['marks']);
    expect(sent[0]).toMatchObject({ measures: [{ who: PLAYER, full: { live: null, kept: [{ shape: 'circle', pts: [300, 300, 440, 300] }] } }] });
    expect(JSON.stringify(sent[0])).not.toMatch(/effect|aura|light|bright|#ec7500/);
    expect(sight(share).lights).toEqual([]);
    expect(share.state().objects.measures ?? {}).toEqual({});
  });
});
