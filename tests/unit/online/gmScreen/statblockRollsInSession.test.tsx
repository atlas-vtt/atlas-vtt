// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceMessage } from '../../../../src/app/online/protocol/index.ts';
import { toTokenVitals } from '../../../../src/app/services/statblockVitalsSync';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { LinkedStatblock } from '../../../../src/app/statblocks/render/LinkedStatblock';
import { captureRollContext } from '../../../../src/app/tools/diceRollOrigins';
import { isPressableRoll } from '../../../../src/app/online/gmScreen/statblocks/pressableRoll.ts';
import { answers, answerTo, diceTool, native, auto, rollsIn, showingHag } from './statblockRollsRig.ts';
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
  document.body.replaceChildren();
});

describe('a press on a roll of a statblock a device shows', { timeout: 20_000 }, () => {
  it('rolls in Atlas exactly as a click on that roll on the DM screen does', async () => {
    const scene = new TestScene('view-1', { ...tokensOf(native), ...tokensOf(auto) });
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    const rolls = rollsIn(drawn.nodes);
    expect(rolls.length).toBeGreaterThan(2);
    expect(rolls.map((roll) => roll.roll)).toEqual(rolls.map((_, index) => index));
    const pressed = rolls.findIndex((roll) => roll.dice === '2d8+4');
    expect(pressed).toBeGreaterThanOrEqual(0);

    await phone.say({ t: 'statblock-roll', id: 1, statblock: id, drawing: drawn.drawing!, roll: pressed });
    expect(await answerTo(started, phone, 1)).toBeNull();
    // What the roll came to, as the dice tool made it
    expect(answers(phone).find((answer) => answer.id === 1)?.result).toEqual({ formula: '2d8+4', total: 9, crit: 'high' });
    expect(rollDice).toHaveBeenCalledTimes(1);
    const fromDevice = rollDice.mock.calls[0];

    // The DM screen's statblock for the same creature, clicked on the same roll.
    const tokens = Object.values(tokensOf(native));
    render(createElement('div', { className: 'atlas-vtt-plugin' }, createElement(LinkedStatblock, {
      app: started.harness.app, path: native.path, variant: 'feed', tokens: tokens.map(toTokenVitals), viewId: 'view-1',
      originContext: captureRollContext('view-1', scene.state(), tokens.map((token) => token.id)), pressableCounters: true,
      tokenActions: { definitions: scene.definitions(), onUpdateToken: vi.fn(), onLocateToken: vi.fn() },
    })));
    const links = await vi.waitFor(() => {
      const found = [...document.querySelectorAll<HTMLElement>('.atlas-dice-link')].filter((link) => !link.closest('.atlas-gm-screen-drawing') && isPressableRoll(link));
      expect(found.length).toBe(rolls.length);
      return found;
    });
    act(() => links[pressed]!.click());
    expect(rollDice).toHaveBeenCalledTimes(2);
    expect(fromDevice).toEqual(rollDice.mock.calls[1]);
    // The formula as drawn, named by its attack, rolled by the hag of this map with the collection's dice
    expect(fromDevice).toMatchObject([
      '2d8+4',
      { type: 'statblock', tokenId: 'hag-1', tokenName: 'Marsh Hag', statblockPath: native.path, abilityName: 'Claws' },
      { viewId: 'view-1', mapPath: scene.state().mapPath, tokenId: 'hag-1' },
      { set: { id: 'builtin:d20', crit: 'natural' } },
    ]);
  });

  it('is refused, and rolls nothing, for a roll it does not name, another statblock, a drawing gone, or no map', async () => {
    const scene = new TestScene('view-1', { ...tokensOf(native), ...tokensOf(auto) });
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    const rolls = rollsIn(drawn.nodes);
    const lurker = (await heardBy(started.rig, phone, 'statblocks')).entries.find((each) => each.name === 'Bog Lurker')!.id;

    await phone.say({ t: 'statblock-roll', id: 1, statblock: id, drawing: drawn.drawing!, roll: rolls.length });
    expect(await answerTo(started, phone, 1)).toBe('changed');
    await phone.say({ t: 'statblock-roll', id: 2, statblock: lurker, drawing: drawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 2)).toBe('changed');
    await phone.say({ t: 'statblock-roll', id: 3, statblock: id, drawing: drawn.drawing! + 1, roll: 0 });
    expect(await answerTo(started, phone, 3)).toBe('changed');

    // The note was edited: the device's drawing is not the one Atlas holds any more.
    started.harness.edit(native.path, native.note.replace('name: Marsh Hag', 'name: Marsh Crone'));
    const redrawn = await heardBy(started.rig, phone, 'statblock', (each) => each.drawing !== drawn.drawing);
    await phone.say({ t: 'statblock-roll', id: 4, statblock: id, drawing: drawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 4)).toBe('changed');
    expect(rollDice).not.toHaveBeenCalled();
    await phone.say({ t: 'statblock-roll', id: 5, statblock: id, drawing: redrawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 5)).toBeNull();
    expect(rollDice).toHaveBeenCalledTimes(1);

    started.front(null);
    await heardBy(started.rig, phone, 'statblocks', (list) => !list.map);
    await phone.say({ t: 'statblock-roll', id: 6, statblock: id, drawing: redrawn.drawing!, roll: 0 });
    expect(await answerTo(started, phone, 6)).toBe('no-map');
    expect(rollDice).toHaveBeenCalledTimes(1);
  });

  it('never rolls a formula of the device\'s own', async () => {
    const scene = new TestScene('view-1', { ...tokensOf(native), ...tokensOf(auto) });
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const rollDice = diceTool(started, scene);
    const hostile = (message: Record<string, unknown>): Promise<boolean> => phone.say(message as unknown as DeviceMessage);

    // A formula beside the roll's number is not read: the roll drawn is what rolls.
    await hostile({ t: 'statblock-roll', id: 1, statblock: id, drawing: drawn.drawing, roll: 0, formula: '1000d100', dice: '1000d100' });
    expect(await answerTo(started, phone, 1)).toBeNull();
    expect(rollDice.mock.calls[0]?.[0]).toBe(rollsIn(drawn.nodes)[0]!.dice);
    // A formula in place of the number is no press at all.
    await hostile({ t: 'statblock-roll', id: 2, statblock: id, drawing: drawn.drawing, roll: '1000d100' });
    await hostile({ t: 'statblock-roll', id: 3, statblock: id, formula: '1d100' });
    await started.rig.settle();
    expect(answers(phone).map((answer) => answer.id)).toEqual([1]);
    expect(rollDice).toHaveBeenCalledTimes(1);
  });
});
