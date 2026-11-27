// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESS_BURST } from '../../../../src/app/online/gmScreen/statblocks/rollPresses.ts';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { answers, answerTo, auto, diceTool, native, PHONE, showingHag } from './statblockRollsRig.ts';
import type { Device } from './sessionRig.ts';
import { allowed, heardBy, type StatblocksSession } from './statblocksSession.ts';
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

/** The phone's page after it left and came back: a page connected anew that opens the statblock again; the drawing it is shown. */
async function backAgain(started: StatblocksSession, id: string): Promise<{ phone: Device; drawing: number }> {
  const phone = await started.rig.device(PHONE);
  started.rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
  await started.rig.settle();
  await phone.say({ t: 'statblock-view', id });
  const drawn = await heardBy(started.rig, phone, 'statblock', (each) => each.id === id);
  return { phone, drawing: drawn.drawing! };
}

describe('a device\'s presses across its connections', { timeout: 30_000 }, () => {
  it('answers a press sent again after the device left and came back as it was, and rolls it once', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    await phone.say({ t: 'statblock-roll', id: 7, statblock: id, drawing: drawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 7)).toBeNull();
    const [first] = answers(phone);
    started.rig.socket().receive({ t: 'player-left', id: PHONE });
    await started.rig.settle();
    const back = await backAgain(started, id);
    await back.phone.say({ t: 'statblock-roll', id: 7, statblock: id, drawing: back.drawing, roll: 0 });
    expect(await answerTo(started, back.phone, 7)).toBeNull();
    expect(answers(back.phone)).toEqual([first]);
    expect(rollDice).toHaveBeenCalledTimes(1);
  });

  it('keeps the pace of the device through a blip of Atlas\'s own connection', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    for (let press = 1; press <= PRESS_BURST; press++) await phone.say({ t: 'statblock-roll', id: press, statblock: id, drawing: drawn.drawing!, roll: 0 });
    await vi.waitFor(async () => {
      await started.rig.settle();
      expect(answers(phone)).toHaveLength(PRESS_BURST);
    });
    started.rig.socket().drop();
    started.rig.timers.advance(1_000);
    started.rig.socket().welcome([{ id: PHONE, name: 'Phone' }]);
    await started.rig.settle();
    const before = new Set(phone.heard);
    await phone.say({ t: 'statblock-view', id });
    const redrawn = await heardBy(started.rig, phone, 'statblock', (each) => each.id === id && !before.has(each));
    await phone.say({ t: 'statblock-roll', id: 100, statblock: id, drawing: redrawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 100)).toBe('too-fast');
    expect(rollDice).toHaveBeenCalledTimes(PRESS_BURST);
  });

  it('forgets them once the device is removed: allowed again, its press rolls anew', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    await phone.say({ t: 'statblock-roll', id: 7, statblock: id, drawing: drawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 7)).toBeNull();
    started.rig.session.remove(PHONE);
    await started.rig.settle();
    const again = await allowed(started.rig, PHONE);
    await again.say({ t: 'statblock-view', id });
    const redrawn = await heardBy(started.rig, again, 'statblock', (each) => each.id === id);
    await again.say({ t: 'statblock-roll', id: 7, statblock: id, drawing: redrawn.drawing!, roll: 0 });
    expect(await answerTo(started, again, 7)).toBeNull();
    expect(rollDice).toHaveBeenCalledTimes(2);
  });

  it('forgets them once Sidekick stops: started again, the press rolls anew', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    await phone.say({ t: 'statblock-roll', id: 7, statblock: id, drawing: drawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 7)).toBeNull();
    started.rig.session.stop();
    await started.rig.settle();
    await started.rig.session.start();
    started.rig.socket().welcome([{ id: PHONE, name: 'Phone' }]);
    await started.rig.settle();
    const before = new Set(phone.heard);
    await phone.say({ t: 'statblock-view', id });
    const redrawn = await heardBy(started.rig, phone, 'statblock', (each) => each.id === id && !before.has(each));
    await phone.say({ t: 'statblock-roll', id: 7, statblock: id, drawing: redrawn.drawing!, roll: 0 });
    await vi.waitFor(async () => {
      await started.rig.settle();
      expect(answers(phone).filter((answer) => answer.id === 7)).toHaveLength(2);
    });
    expect(rollDice).toHaveBeenCalledTimes(2);
  });
});
