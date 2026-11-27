// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTROL_BURST } from '../../../../src/app/online/gmScreen/statblocks/statblockPresses.ts';
import type { DrawnElement, DrawnNode, GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { auto, native, showingHag } from './statblockRollsRig.ts';
import { heardBy, type StatblocksSession } from './statblocksSession.ts';
import { TestScene, tokensOf } from './statblocksRig.ts';
import type { Device } from './sessionRig.ts';

type PressAnswer = Extract<GmScreenMessage, { t: 'statblock-press-answer' }>;

let session: StatblocksSession | null = null;

afterEach(() => {
  cleanup();
  session?.screen.dispose();
  if (session) TemplateLibrary.release(session.harness.app);
  session?.harness.dispose();
  session = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const hagScene = (): TestScene => new TestScene('view-1', { ...tokensOf(native), ...tokensOf(auto) });

/** The classes an element and everything it holds carry. */
const classesIn = (node: DrawnNode): string[] => (typeof node === 'string' ? [] : [...(node.c ?? []), ...(node.k ?? []).flatMap(classesIn)]);

/** The controls of a drawn statblock, in the order Atlas numbered them, each with the classes it and its icon carry. */
function controlsIn(nodes: readonly DrawnNode[]): { readonly press: number; readonly classes: string[] }[] {
  return nodes.flatMap((node) => (typeof node === 'string' ? [] : [
    ...(node.press === undefined ? [] : [{ press: node.press, classes: classesIn(node) }]),
    ...controlsIn(node.k ?? []),
  ]));
}

const control = (nodes: readonly DrawnNode[], icon: string): number => controlsIn(nodes).find((each) => each.classes.includes(icon))!.press;

const pressAnswers = (device: Device): PressAnswer[] => device.heard.filter((message): message is PressAnswer => message.t === 'statblock-press-answer');

async function pressAnswerTo(started: StatblocksSession, device: Device, id: number): Promise<string | null> {
  return (await heardBy(started.rig, device, 'statblock-press-answer', (answer) => answer.id === id)).refused;
}

describe('what a device\'s press on a statblock\'s token controls does', { timeout: 30_000 }, () => {
  it('numbers the token controls Atlas draws, and only those', async () => {
    const { started, drawn } = await showingHag(hagScene());
    session = started;
    const controls = controlsIn(drawn.nodes);
    expect(controls.map((each) => each.press)).toEqual(controls.map((_, at) => at));
    expect(controls.some((each) => each.classes.includes('lucide-minus'))).toBe(true);
    expect(controls.some((each) => each.classes.includes('lucide-locate-fixed'))).toBe(true);
    // A roll is a roll, never a control
    const both = (nodes: readonly DrawnNode[]): DrawnElement[] => nodes.flatMap((node) => (typeof node === 'string' ? [] : [...(node.press !== undefined && node.roll !== undefined ? [node] : []), ...both(node.k ?? [])]));
    expect(both(drawn.nodes)).toEqual([]);
  });

  it('changes the token\'s resource as the GM\'s click on its step does, and locates the token', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    await phone.say({ t: 'statblock-press', id: 1, statblock: id, drawing: drawn.drawing!, press: control(drawn.nodes, 'lucide-minus') });
    expect(await pressAnswerTo(started, phone, 1)).toBeNull();
    expect(scene.updateToken).toHaveBeenCalledTimes(1);
    await phone.say({ t: 'statblock-press', id: 2, statblock: id, drawing: drawn.drawing!, press: control(drawn.nodes, 'lucide-locate-fixed') });
    expect(await pressAnswerTo(started, phone, 2)).toBeNull();
    expect(scene.locateToken).toHaveBeenCalledTimes(1);
  });

  it('presses once for a press id sent again, and refuses a control the drawing does not hold or another drawing', async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const minus = control(drawn.nodes, 'lucide-minus');
    for (let sent = 0; sent < 5; sent++) await phone.say({ t: 'statblock-press', id: 7, statblock: id, drawing: drawn.drawing!, press: minus });
    await vi.waitFor(async () => {
      await started.rig.settle();
      expect(pressAnswers(phone)).toHaveLength(5);
    });
    expect(scene.updateToken).toHaveBeenCalledTimes(1);
    await phone.say({ t: 'statblock-press', id: 8, statblock: id, drawing: drawn.drawing!, press: controlsIn(drawn.nodes).length });
    expect(await pressAnswerTo(started, phone, 8)).toBe('changed');
    await phone.say({ t: 'statblock-press', id: 9, statblock: id, drawing: drawn.drawing! + 1, press: minus });
    expect(await pressAnswerTo(started, phone, 9)).toBe('changed');
    expect(scene.updateToken).toHaveBeenCalledTimes(1);
  });

  it(`presses a burst of ${CONTROL_BURST} at once and refuses the rest as too fast`, async () => {
    const scene = hagScene();
    const { started, phone, id, drawn } = await showingHag(scene);
    session = started;
    const locate = control(drawn.nodes, 'lucide-locate-fixed');
    for (let press = 1; press <= CONTROL_BURST + 3; press++) await phone.say({ t: 'statblock-press', id: press, statblock: id, drawing: drawn.drawing!, press: locate });
    await vi.waitFor(async () => {
      await started.rig.settle();
      expect(pressAnswers(phone)).toHaveLength(CONTROL_BURST + 3);
    });
    expect(pressAnswers(phone).map((answer) => answer.refused)).toEqual([...Array<null>(CONTROL_BURST).fill(null), 'too-fast', 'too-fast', 'too-fast']);
    expect(scene.locateToken).toHaveBeenCalledTimes(CONTROL_BURST);
  });
});
