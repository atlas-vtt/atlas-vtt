// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESS_BURST, PRESS_REFILL_MS, RollPresses } from '../../../../src/app/online/gmScreen/statblocks/rollPresses.ts';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { answers, answerTo, auto, diceTool, native, rollsIn, showingHag } from './statblockRollsRig.ts';
import { heardBy, type StatblocksSession } from './statblocksSession.ts';
import { TestScene, tokensOf } from './statblocksRig.ts';

let session: StatblocksSession | null = null;

afterEach(() => {
  cleanup();
  session?.screen.dispose();
  if (session) TemplateLibrary.release(session.harness.app);
  session?.harness.dispose();
  session = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const hagScene = (): TestScene => new TestScene('view-1', { ...tokensOf(native), ...tokensOf(auto) });

describe('what a device\'s press on a statblock roll may do', { timeout: 30_000 }, () => {
  it('never reaches the hit dice, whose click rolls hit points onto the creature\'s tokens', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    expect(JSON.stringify(drawn.nodes)).toContain('11d8');
    const rolls = rollsIn(drawn.nodes);
    expect(rolls.map((roll) => roll.dice)).not.toContain('11d8+33');
    // Each press a second after the one before, as a GM's are
    let clock = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => (clock += PRESS_REFILL_MS));
    for (const [at] of rolls.entries()) {
      await phone.say({ t: 'statblock-roll', id: 100 + at, statblock: id, drawing: drawn.drawing!, roll: at });
      expect(await answerTo(started, phone, 100 + at)).toBeNull();
    }
    expect(rollDice).toHaveBeenCalledTimes(rolls.length);
    expect(rollDice.mock.calls.map((call) => call[0])).not.toContain('11d8+33');
    expect(scene.updateToken).not.toHaveBeenCalled();
  });

  it('rolls once for a press id sent again, which is answered as it was', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    for (let sent = 0; sent < 40; sent++) await phone.say({ t: 'statblock-roll', id: 7, statblock: id, drawing: drawn.drawing!, roll: 0 });
    await vi.waitFor(async () => {
      await started.rig.settle();
      expect(answers(phone)).toHaveLength(40);
    });
    expect(rollDice).toHaveBeenCalledTimes(1);
    expect(new Set(answers(phone).map((answer) => JSON.stringify(answer))).size).toBe(1);
  });

  it(`rolls a burst of presses only ${PRESS_BURST} times, and refuses the rest as too fast`, async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    for (let press = 1; press <= 10; press++) await phone.say({ t: 'statblock-roll', id: press, statblock: id, drawing: drawn.drawing!, roll: 0 });
    await vi.waitFor(async () => {
      await started.rig.settle();
      expect(answers(phone)).toHaveLength(10);
    });
    expect(rollDice).toHaveBeenCalledTimes(PRESS_BURST);
    expect(answers(phone).map((answer) => answer.refused)).toEqual([...Array<null>(PRESS_BURST).fill(null), ...Array<string>(10 - PRESS_BURST).fill('too-fast')]);
  });

  it('is told nothing rolled where the press reached its roll and the map made none, and no map while its map loads', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    // The map's view closed a moment ago: the list still says a map is in front, and no dice tool is left to roll
    Object.assign(started.harness.app.workspace, { getLeavesOfType: () => [] });
    await phone.say({ t: 'statblock-roll', id: 1, statblock: id, drawing: drawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 1)).toBe('not-rolled');

    const rollDice = diceTool(started, scene);
    scene.set({ isMapLoading: true });
    await phone.say({ t: 'statblock-roll', id: 2, statblock: id, drawing: drawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 2)).toBe('no-map');
    expect(rollDice).not.toHaveBeenCalled();
    expect((await heardBy(started.rig, phone, 'statblocks')).map).toBe(true);
  });
});

describe('the pace of a device\'s rolls', () => {
  it(`takes ${PRESS_BURST} at once, then one more for every ${PRESS_REFILL_MS} ms, each device on its own, and forgets a device that left`, () => {
    let now = 0;
    const presses = new RollPresses(() => now);
    const press = (device: string, id: number): string | null => presses.answer(device, id, (pace) => (pace() ? { refused: null } : { refused: 'too-fast' })).refused;
    expect([1, 2, 3, 4].map((id) => press('a', id))).toEqual([null, null, null, 'too-fast']);
    expect(press('b', 1)).toBeNull();
    now += PRESS_REFILL_MS / 2;
    expect(press('a', 5)).toBe('too-fast');
    now += PRESS_REFILL_MS / 2;
    expect(press('a', 6)).toBeNull();
    expect(press('a', 4)).toBe('too-fast');
    presses.forget('a');
    expect(press('a', 4)).toBeNull();
  });
});
