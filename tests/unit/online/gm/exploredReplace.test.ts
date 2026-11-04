import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { parseGmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { describe, expect, it } from 'vitest';
import { EXPLORED_INTERVAL_MS } from '../../../../src/app/online/gm/InputShare.ts';
import { sceneState, shareHarness, type ShareHarness } from './shareHarness.ts';

type Explored = Extract<GmMessage, { t: 'explored' }>;

const mask = (name: string): string => `data:image/png;base64,${btoa(name)}`;
const LIT = { lighting: { enabled: true, ambient: 0.2 } };
const MAP = new Map([['maps/cave.webp', new Uint8Array(64)], ['maps/upper.webp', new Uint8Array(32)]]);

const explored = (table: ShareHarness): Explored[] => table.sent.flatMap(({ body }) => (body.t === 'explored' ? [body] : []));
/** The count of removals each explored message players got carries. */
const serials = (table: ShareHarness): (number | undefined)[] => explored(table).map((body) => body.serial);
/** The memory each explored message players got holds, by the name `mask` gave it; null for none. */
const memories = (table: ShareHarness): (string | null)[] => explored(table).map((body) => (body.png === undefined ? null : atob(body.png)));

async function shared(state: SceneState): Promise<ShareHarness> {
  const table = shareHarness(state, MAP);
  table.share.start();
  await table.set(state);
  await table.advance(EXPLORED_INTERVAL_MS + 100);
  return table;
}

/** The GM's next state, sent and given time to reach players. */
async function then(table: ShareHarness, changes: Partial<SceneState>): Promise<void> {
  await table.set({ ...table.state(), ...changes });
  await table.advance(EXPLORED_INTERVAL_MS + 100);
}

/** The scene's map loads again (a snapshot restored, the scene reopened): cleared while it loads, then `changes`. */
async function reload(table: ShareHarness, changes: Partial<SceneState>): Promise<void> {
  await then(table, { isMapLoading: true, exploredMask: null, exploredEdits: 0 });
  await then(table, { isMapLoading: false, ...changes });
}

describe('an explored memory the GM saves', () => {
  it('keeps its count of removals while sight alone made it, so players add it to what they saw since', async () => {
    const table = await shared(sceneState({ ...LIT, exploredMask: mask('first') }));
    await then(table, { exploredMask: mask('more') });
    expect(serials(table)).toEqual([0, 0]);
  });

  it('counts a removal with the save that holds memory the GM took away by hand, and every save after carries it', async () => {
    const table = await shared(sceneState({ ...LIT, exploredMask: mask('first') }));
    // Forget: the edit is counted at once, the memory saved after it.
    await table.set({ ...table.state(), exploredEdits: 1 });
    await then(table, { exploredMask: mask('forgotten') });
    await then(table, { exploredMask: mask('seen since') });
    // Undo of it is an edit too.
    await table.set({ ...table.state(), exploredEdits: 0 });
    await then(table, { exploredMask: mask('back') });
    expect(serials(table)).toEqual([0, 1, 1, 2]);
    const sent = explored(table);
    expect(parseGmMessage(JSON.parse(JSON.stringify(sent[1])))).toEqual(sent[1]);
  });

  it('counts a removal where the memory went as none after it was some, or was switched off', async () => {
    const table = await shared(sceneState({ ...LIT, exploredMask: mask('first') }));
    await then(table, { exploredMask: null });
    await then(table, { exploredMask: mask('again') });
    await then(table, { lighting: { ...LIT.lighting, exploredMemory: false } });
    expect(serials(table)).toEqual([0, 1, 1, 2]);
    expect(memories(table)).toEqual(['first', null, 'again', 'again']);
  });

  it('counts a removal where a load ends with another memory than before it (a snapshot restored), and sends nothing while it loads', async () => {
    const table = await shared(sceneState({ ...LIT, exploredMask: mask('A') }));
    await then(table, { exploredMask: mask('AB') });
    await reload(table, { exploredMask: mask('A') });
    expect(memories(table)).toEqual(['A', 'AB', 'A']);
    expect(serials(table)).toEqual([0, 0, 1]);
  });

  it('counts one removal where a load after edits by hand ends with another memory, its count of edits starting over', async () => {
    const table = await shared(sceneState({ ...LIT, exploredMask: mask('A') }));
    await then(table, { exploredMask: mask('AB') });
    await table.set({ ...table.state(), exploredEdits: 3 });
    await reload(table, { exploredMask: mask('A') });
    await then(table, { exploredMask: mask('AC') });
    expect(serials(table)).toEqual([0, 0, 1, 1]);
  });

  it('sends nothing while the map loads, though a save was waiting to go, and the memory once the load is done', async () => {
    const table = await shared(sceneState({ ...LIT, exploredMask: mask('A') }));
    await table.set({ ...table.state(), exploredMask: mask('AB') });
    await table.set({ ...table.state(), exploredMask: mask('ABC') });
    await then(table, { isMapLoading: true, exploredMask: null, exploredEdits: 0 });
    expect(memories(table)).toEqual(['A', 'AB']);
    await then(table, { isMapLoading: false, exploredMask: mask('ABC') });
    expect(memories(table)).toEqual(['A', 'AB', 'ABC']);
  });

  it('counts none where a load ends with the memory it began with (the scene reopened, the GM back from another tab)', async () => {
    const table = await shared(sceneState({ ...LIT, exploredMask: mask('A') }));
    await reload(table, { exploredMask: mask('A') });
    await then(table, { exploredMask: mask('AB') });
    expect(serials(table)).toEqual([0, 0]);
  });

  describe('where the scene comes back under its id, its references made again (`refreshAssets`)', () => {
    /** Players kept what they drew of the scene: the memory after AB must replace theirs, or they keep B. */
    const expectReplaced = (table: ShareHarness): void => {
      const sent = explored(table);
      const [before, after] = [sent.findLast((body) => body.png === btoa('AB')), sent.findLast((body) => body.png === btoa('A'))];
      expect(new Set(sent.map(({ scene }) => scene)).size).toBe(1);
      expect(after?.serial).toBeGreaterThan(before?.serial ?? Infinity);
    };

    it('counts a removal for an edit before it and the save after it', async () => {
      const table = await shared(sceneState({ ...LIT, exploredMask: mask('AB') }));
      await table.set({ ...table.state(), exploredEdits: 1 });
      table.share.refreshAssets();
      await table.settle();
      await then(table, { exploredMask: mask('A') });
      expectReplaced(table);
    });

    it('counts a removal for an edit and its save while the map is read again', async () => {
      const table = await shared(sceneState({ ...LIT, exploredMask: mask('AB') }));
      table.share.refreshAssets();
      void table.set({ ...table.state(), exploredEdits: 1 });
      await then(table, { exploredMask: mask('A') });
      expectReplaced(table);
    });

    it('counts a removal for a snapshot load it falls into', async () => {
      const table = await shared(sceneState({ ...LIT, exploredMask: mask('AB') }));
      await then(table, { isMapLoading: true, exploredMask: null, exploredEdits: 0 });
      table.share.refreshAssets();
      await table.settle();
      await then(table, { isMapLoading: false, exploredMask: mask('A') });
      expectReplaced(table);
    });

    it('still counts the save of an edit made before it, where the memory it first sends is the old one', async () => {
      const table = await shared(sceneState({ ...LIT, exploredMask: mask('AB') }));
      await table.set({ ...table.state(), exploredEdits: 1 });
      table.share.refreshAssets();
      await table.advance(EXPLORED_INTERVAL_MS + 100);
      const resent = explored(table).at(-1);
      expect(resent?.png).toBe(btoa('AB'));
      await then(table, { exploredMask: mask('A') });
      expect(explored(table).at(-1)?.serial).toBeGreaterThan(resent?.serial ?? Infinity);
    });
  });

  it('is not counted by an edit of a floor the players are not on', async () => {
    const levels: SceneLevel[] = [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/cave.webp' },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
    ];
    const table = shareHarness(sceneState({ ...LIT, levels, viewedLevel: 'ground', exploredMask: mask('ground') }), MAP);
    table.presented = 'ground';
    table.share.start();
    await table.set(table.state());
    await table.advance(EXPLORED_INTERVAL_MS + 100);
    // The GM edits the floor above, then comes back and the ground's memory is saved.
    await table.set({ ...table.state(), viewedLevel: 'upper' });
    await then(table, { exploredEdits: 1, exploredMasks: { upper: mask('upper forgotten') } });
    await table.set({ ...table.state(), viewedLevel: 'ground' });
    await then(table, { exploredMask: mask('ground seen') });
    expect(serials(table)).toEqual([0, 0]);
  });

  it('is refused by players where its count is no whole number', () => {
    expect(parseGmMessage({ t: 'explored', scene: 's1', serial: -1 })).toBeNull();
    expect(parseGmMessage({ t: 'explored', scene: 's1', serial: 1.5 })).toBeNull();
    expect(parseGmMessage({ t: 'explored', scene: 's1', serial: '1' })).toBeNull();
    expect(parseGmMessage({ t: 'explored', scene: 's1', serial: 2 })).toEqual({ t: 'explored', scene: 's1', serial: 2 });
  });
});
