import { vi } from 'vitest';
import type { GmScreenOutlet } from '../../../../src/app/online/gmScreen/screens.ts';
import type { FrontScene, FrontSceneState, FrontScenes } from '../../../../src/app/online/gmScreen/statblocks/frontScene.ts';
import { PortraitShelf } from '../../../../src/app/online/gmScreen/statblocks/PortraitShelf.ts';
import { StatblockDrawing } from '../../../../src/app/online/gmScreen/statblocks/StatblockDrawing.ts';
import { StatblocksScreen } from '../../../../src/app/online/gmScreen/statblocks/StatblocksScreen.ts';
import type { GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { InitiativeState } from '../../../../src/app/types/initiativeTypes';
import { HIT_POINTS, type StatblockScenario } from '../../../fixtures/gmScreenStatblockNotes';
import { scenarioApp, type ScenarioApp } from '../../../helpers/statblockScenarioApp';

const NO_FIGHT: InitiativeState = { entries: [], currentIndex: 0, round: 1, isActive: false };

/** A map view's scene the test changes as the GM would. */
export class TestScene implements FrontScene {
  private readonly listeners = new Set<() => void>();
  private current: FrontSceneState;
  readonly updateToken = vi.fn();
  readonly locateToken = vi.fn();

  constructor(readonly viewId: string, tokens: Record<string, TokenEntity>, mapPath = 'atlas-vtt/maps/Marsh.atlasmap') {
    this.current = { mapPath, mapLoaded: true, isMapLoading: false, objects: { tokens }, initiative: NO_FIGHT };
  }

  state = (): FrontSceneState => this.current;
  definitions = (): typeof HIT_POINTS[] => [HIT_POINTS];

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(changes: Partial<FrontSceneState>): void {
    this.current = { ...this.current, ...changes };
    for (const listener of [...this.listeners]) listener();
  }

  setTokens(tokens: Record<string, TokenEntity>): void {
    this.set({ objects: { tokens } });
  }
}

/** A scenario's tokens as a map holds them, linked to its note. */
export function tokensOf(scenario: StatblockScenario): Record<string, TokenEntity> {
  return Object.fromEntries(scenario.tokens.map((token, index) => [token.id!, {
    ...token, kind: 'character', x: index * 70, y: 70, statblockPath: scenario.path,
  } as unknown as TokenEntity]));
}

export interface StatblocksRig {
  readonly screen: StatblocksScreen;
  readonly harness: ScenarioApp;
  /** Every message sent, with the device it went to. */
  readonly sent: { to: string | undefined; message: GmScreenMessage }[];
  /** What one device was sent, of one type. */
  heard<T extends GmScreenMessage['t']>(device: string, type: T): Extract<GmScreenMessage, { t: T }>[];
  /** Brings another map to the front, or none. */
  front(scene: TestScene | null): void;
  /** A device whose channel opened. */
  open(device: string): void;
}

/** The Statblocks screen on a scenario's vault, drawing for real, with the map in front and the session's outlet played by the test. */
export function statblocksRig(scenarios: readonly StatblockScenario[], scene: TestScene, art?: ArrayBuffer): StatblocksRig {
  const harness = scenarioApp(scenarios, art);
  const sent: StatblocksRig['sent'] = [];
  const devices: string[] = [];
  let front: TestScene | null = scene;
  const watchers = new Set<() => void>();
  const outlet: GmScreenOutlet = { devices, send: (message, to) => void sent.push({ to, message }) };
  const scenes: FrontScenes = {
    current: () => front,
    watch: (listener) => {
      watchers.add(listener);
      return () => watchers.delete(listener);
    },
  };
  const screen = new StatblocksScreen({
    app: harness.app,
    outlet,
    scenes,
    portraits: new PortraitShelf(harness.app, () => Promise.reject(new Error('no image workers here'))),
    drawing: (settled) => new StatblockDrawing(harness.app, settled),
  });
  return {
    screen,
    harness,
    sent,
    heard: (device, type) => sent.filter((each) => each.to === device && each.message.t === type).map((each) => each.message as never),
    front: (next) => {
      front = next;
      for (const watcher of [...watchers]) watcher();
    },
    open: (device) => {
      if (!devices.includes(device)) devices.push(device);
      screen.opened(device);
    },
  };
}
