import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';
import { expect, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { PortraitShelf } from '../../../../src/app/online/gmScreen/statblocks/PortraitShelf.ts';
import { StatblockDrawing } from '../../../../src/app/online/gmScreen/statblocks/StatblockDrawing.ts';
import { StatblocksScreen } from '../../../../src/app/online/gmScreen/statblocks/StatblocksScreen.ts';
import type { GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockScenario } from '../../../fixtures/gmScreenStatblockNotes';
import { scenarioApp, type ScenarioApp } from '../../../helpers/statblockScenarioApp';
import { RelaySocket, sessionRig, type Device, type Rig } from './sessionRig.ts';
import type { TestScene } from './statblocksRig.ts';

/** A device that knocks, is allowed, joins and has its channel open. */
export async function allowed(rig: Rig, id: string): Promise<Device> {
  const device = await rig.device(id);
  rig.socket().receive({ t: 'knock', id, name: 'Phone' });
  await rig.settle();
  rig.timers.advance(ARM_MS);
  expect(rig.session.allow(id)).toBe(true);
  rig.socket().receive({ t: 'player-joined', id, name: 'Phone' });
  await rig.settle();
  return device;
}

/** Hands on what was sent until the device heard a message of `type` that `matches`; that message. */
export async function heardBy<T extends GmScreenMessage['t']>(
  rig: Rig, device: { heard: GmScreenMessage[] }, type: T, matches: (message: Extract<GmScreenMessage, { t: T }>) => boolean = () => true,
): Promise<Extract<GmScreenMessage, { t: T }>> {
  const found = (): Extract<GmScreenMessage, { t: T }> | undefined =>
    device.heard.filter((message): message is Extract<GmScreenMessage, { t: T }> => message.t === type).findLast(matches);
  await vi.waitFor(async () => {
    await rig.settle();
    expect(found(), JSON.stringify(device.heard.map((message) => message.t))).toBeDefined();
  }, { timeout: 5000, interval: 50 });
  return found()!;
}

export interface StatblocksSession {
  readonly rig: Rig;
  readonly harness: ScenarioApp;
  readonly screen: StatblocksScreen;
  /** Which map is in front: the scene, or none. */
  front(scene: TestScene | null): void;
}

/**
 * The Statblocks screen plugged into a GM screen session on a scenario's vault, drawing for real, its devices reached
 * through their encrypted channels. The channel's keys come from Node's Web Crypto, which takes bytes of Node's own
 * realm only, so the test's encoders are Node's.
 */
export async function statblocksSession(scenarios: readonly StatblockScenario[], scene: TestScene, art: ArrayBuffer): Promise<StatblocksSession> {
  RelaySocket.all = [];
  vi.stubGlobal('TextEncoder', NodeTextEncoder);
  vi.stubGlobal('TextDecoder', NodeTextDecoder);
  const rig = sessionRig();
  await rig.session.start();
  rig.socket().welcome();
  await rig.settle();
  const harness = scenarioApp(scenarios, art);
  let front: TestScene | null = scene;
  const watchers = new Set<() => void>();
  const screen = new StatblocksScreen({
    app: harness.app,
    outlet: rig.session,
    scenes: {
      current: () => front,
      watch: (listener) => {
        watchers.add(listener);
        return () => watchers.delete(listener);
      },
    },
    portraits: new PortraitShelf(harness.app, () => Promise.reject(new Error('no image workers here'))),
    drawing: (settled) => new StatblockDrawing(harness.app, settled),
  });
  rig.session.plug(screen);
  return {
    rig, harness, screen,
    front: (next) => {
      front = next;
      for (const watcher of [...watchers]) watcher();
    },
  };
}
