import { parseGmMessage, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../../../src/app/grid/measurementFormat';
import { TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { RulesShare, sharedRules } from '../../../../src/app/online/gm/RulesShare.ts';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { sceneState as state, shareHarness } from './shareHarness.ts';

const GRID = { enabled: true, size: 70, offsetX: 10, offsetY: 5, opacity: 1 } as const;
const DAGGERHEART: MeasurementSettings = {
  mode: 'abstract', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', coneAngle: 60,
  rangeBands: [{ name: 'Melee', maxSquares: 1 }, { name: 'Close', maxSquares: 6 }],
};

const rulesOf = (sent: readonly { readonly body: GmMessage; readonly to: string | undefined }[]): { readonly body: GmMessage; readonly to: string | undefined }[] => sent.filter(({ body }) => body.t === 'rules');

function fakeStore(initial: SceneState): { readonly store: SceneStore; readonly set: (next: SceneState) => void } {
  let current = initial;
  return {
    store: { getState: () => current, setState: () => undefined, subscribe: () => () => undefined },
    set: (next) => {
      current = next;
    },
  };
}

describe('the rules players measure by', () => {
  it('carry the grid, its snap, the GM\'s measurement and accent, and read back as sent', () => {
    const rules = sharedRules({ ...GRID, type: 'hex-vertical', snapToGrid: false }, DAGGERHEART, '#d4a017');
    expect(rules).toEqual({ grid: { type: 'hex-vertical', size: 70, offsetX: 10, offsetY: 5 }, snap: false, measurement: DAGGERHEART, accent: '#d4a017' });
    expect(parseGmMessage(JSON.parse(JSON.stringify({ t: 'rules', scene: 's1', ...rules })))).toEqual({ t: 'rules', scene: 's1', ...rules });
  });

  it('fall back to the grid\'s own measurement, as Atlas\'s ruler does, and snap unless the grid says not', () => {
    const rules = sharedRules({ ...GRID, measurementType: 'units', unitType: 'meters', unitDistance: 1.5 }, null, null);
    expect(rules?.snap).toBe(true);
    expect(rules?.grid.type).toBe('square');
    expect(rules?.measurement).toMatchObject({ mode: 'metric', unitType: 'meters', unitDistance: 1.5 });
  });

  it('say that everyone shows their cursor only while the GM lets them', () => {
    expect(sharedRules(GRID, DAGGERHEART, null)).not.toHaveProperty('cursors');
    const rules = sharedRules(GRID, DAGGERHEART, null, true);
    expect(rules?.cursors).toBe(true);
    expect(parseGmMessage(JSON.parse(JSON.stringify({ t: 'rules', scene: 's1', ...rules })))).toEqual({ t: 'rules', scene: 's1', ...rules });
  });

  it('are none for a scene without a usable grid', () => {
    expect(sharedRules(null, DAGGERHEART, null)).toBeNull();
    expect(sharedRules({ ...GRID, size: 0 }, DAGGERHEART, null)).toBeNull();
    expect(sharedRules({ ...GRID, size: Number.NaN }, DAGGERHEART, null)).toBeNull();
    expect(sharedRules({ ...GRID, offsetX: 1e9 }, DAGGERHEART, null)).toBeNull();
  });

  it('go out when the scene is shared, again only when they change, and to a player who joins', () => {
    const { store, set } = fakeStore(state({ grid: GRID }));
    const sent: { body: GmMessage; to: string | undefined }[] = [];
    let measurement: MeasurementSettings | null = DAGGERHEART;
    const share = new RulesShare(store, { send: (body, to) => void sent.push({ body, to }), measurement: () => measurement, accent: () => '#112233' });
    share.update();
    expect(sent).toEqual([]);
    share.setScene('s1');
    share.update();
    expect(sent).toHaveLength(1);
    measurement = { ...DAGGERHEART, coneAngle: 90 };
    share.update();
    set(state({ grid: { ...GRID, snapToGrid: false } }));
    share.update();
    expect(sent.map(({ body }) => (body.t === 'rules' ? [body.measurement.coneAngle, body.snap] : null))).toEqual([[60, true], [90, true], [90, false]]);
    share.resend('ana');
    expect(sent.at(-1)).toEqual({ body: sent[2]?.body, to: 'ana' });
    share.setScene(null);
    share.update();
    expect(sent).toHaveLength(4);
  });

  it('follow the shared scene, its joiners and its poll', async () => {
    const table = shareHarness(state({ grid: GRID }), new Map([['maps/cave.webp', new Uint8Array([1, 2, 3])]]));
    table.share.start();
    await table.set(state({ grid: GRID }));
    const scene = table.sent.find(({ body }) => body.t === 'scene')?.body;
    const first = rulesOf(table.sent);
    expect(first).toHaveLength(1);
    expect(first[0]?.body).toMatchObject({ t: 'rules', scene: scene?.t === 'scene' ? scene.scene?.id : '', snap: true, accent: null });
    table.share.resend('ben');
    expect(rulesOf(table.sent).at(-1)?.to).toBe('ben');
    await table.set(state({ grid: { ...GRID, size: 100 } }));
    await table.advance(TOKEN_POLL_MS);
    expect(rulesOf(table.sent).at(-1)?.body).toMatchObject({ grid: { size: 100 } });
    table.share.stop();
  });
});
