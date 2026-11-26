// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { PortraitShelf } from '../../../../src/app/online/gmScreen/statblocks/PortraitShelf.ts';
import { StatblockDrawing } from '../../../../src/app/online/gmScreen/statblocks/StatblockDrawing.ts';
import { StatblocksScreen } from '../../../../src/app/online/gmScreen/statblocks/StatblocksScreen.ts';
import type { GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { STATBLOCK_SCENARIOS } from '../../../fixtures/gmScreenStatblockNotes';
import { scenarioApp, type ScenarioApp } from '../../../helpers/statblockScenarioApp';
import { deviceId, RelaySocket, sessionRig, type Rig } from './sessionRig.ts';
import { TestScene, tokensOf } from './statblocksRig.ts';

const PHONE = deviceId('p');
const native = STATBLOCK_SCENARIOS.find((scenario) => scenario.id === 'native')!;
const ART = readFileSync(path.resolve(__dirname, '../../../fixtures/images/rgb8.png'));

let harness: ScenarioApp | null = null;
let screen: StatblocksScreen | null = null;

afterEach(() => {
  screen?.dispose();
  if (harness) TemplateLibrary.release(harness.app);
  harness?.dispose();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** A device that knocks, is allowed, joins and has its channel open. */
async function allowed(rig: Rig, id: string): Promise<Awaited<ReturnType<Rig['device']>>> {
  const device = await rig.device(id);
  rig.socket().receive({ t: 'knock', id, name: 'Phone' });
  await rig.settle();
  rig.timers.advance(ARM_MS);
  expect(rig.session.allow(id)).toBe(true);
  rig.socket().receive({ t: 'player-joined', id, name: 'Phone' });
  await rig.settle();
  return device;
}

/** Hands on what was sent until the device heard a message of `type`. */
async function heardBy<T extends GmScreenMessage['t']>(rig: Rig, device: { heard: GmScreenMessage[] }, type: T): Promise<Extract<GmScreenMessage, { t: T }>> {
  await vi.waitFor(async () => {
    await rig.settle();
    expect(device.heard.some((message) => message.t === type)).toBe(true);
  }, { timeout: 5000, interval: 50 });
  return device.heard.find((message) => message.t === type) as Extract<GmScreenMessage, { t: T }>;
}

describe('the Statblocks screen plugged into a GM screen session', () => {
  it('reaches an allowed device through its encrypted channel: the list, the statblock it opens and its picture', async () => {
    RelaySocket.all = [];
    // The channel's keys come from Node's Web Crypto, which takes bytes of Node's own realm only, not jsdom's.
    vi.stubGlobal('TextEncoder', NodeTextEncoder);
    vi.stubGlobal('TextDecoder', NodeTextDecoder);
    const rig = sessionRig();
    await rig.session.start();
    rig.socket().welcome();
    await rig.settle();
    harness = scenarioApp([native], ART.buffer.slice(ART.byteOffset, ART.byteOffset + ART.byteLength));
    const scene = new TestScene('view-1', tokensOf(native));
    screen = new StatblocksScreen({
      app: harness.app,
      outlet: rig.session,
      scenes: { current: () => scene, watch: () => () => undefined },
      portraits: new PortraitShelf(harness.app, () => Promise.reject(new Error('no image workers here'))),
      drawing: (settled) => new StatblockDrawing(harness!.app, settled),
    });
    rig.session.plug(screen);
    const phone = await allowed(rig, PHONE);

    const list = await heardBy(rig, phone, 'statblocks');
    const [hag] = list.entries;
    expect(hag).toMatchObject({ name: 'Marsh Hag', count: 1 });

    await phone.say({ t: 'statblock-view', id: hag!.id });
    const drawn = await heardBy(rig, phone, 'statblock');
    expect(drawn).toMatchObject({ id: hag!.id, cut: false });
    expect(JSON.stringify(drawn)).toContain('Drowning Curse');

    await phone.say({ t: 'portrait-ask', hash: hag!.portrait! });
    expect(await heardBy(rig, phone, 'portrait')).toEqual({ t: 'portrait', hash: hag!.portrait, mime: 'image/png', data: ART.toString('base64') });
    // Nothing of it went to the relay in the clear.
    const frames = JSON.stringify(rig.socket().frames());
    expect(frames).not.toMatch(/Marsh Hag|Drowning Curse|Bestiary/);
  });
});
