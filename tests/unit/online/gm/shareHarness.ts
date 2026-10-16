import { DeltaReader, parseGmMessage, type DeltaOf, type GmMessage, type RollRequestAnswer } from '../../../../src/app/online/protocol/index.ts';
import type { LoggedRoll, RollRequest } from '../../../../src/app/online/gm/log/TableLog.ts';
import { produce } from 'immer';
import type { TokenEntity } from '../../../../src/app/types';
import type { TokenPerception } from '../../../../src/app/vision/tokenPerception';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import { imageMimeType, SceneShare } from '../../../../src/app/online/gm/SceneShare.ts';
import type { DiceSource } from '../../../../src/app/online/gm/atlasDice.ts';
import type { AtlasPlayerSettings, LightingSource } from '../../../../src/app/online/gm/atlasLighting.ts';
import type { MapLayerSource } from '../../../../src/app/online/gm/atlasMapLayers.ts';
import type { TokenRules } from '../../../../src/app/online/gm/tokenUI.ts';
import type { RemoteDrag } from '../../../../src/app/online/marks/index.ts';
import type { GmRuler } from '../../../../src/app/online/gm/dragRulers.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';
import { GENERIC_SOURCE, LIGHTING_ON } from './gmLighting.ts';
import { settled } from './settled.ts';

export const GRID_SIZE = 70;

/** A scene state with the given changes; no tokens, a map at `maps/cave.webp`. */
export function sceneState(changes: Partial<SceneState> = {}): SceneState {
  return {
    mapPath: 'Scenes/Cave.atlasmap', mapLoaded: true, isMapLoading: false, background: 'maps/cave.webp', grid: null, isDragging: false, _audioDirty: false,
    lighting: { enabled: false, ambient: 1 }, heldTokens: {}, exploredMask: null, objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {}, audios: {} },
    ...changes,
  };
}

/** A token at a place, with an image of its own. */
export function token(id: string, changes: Partial<TokenEntity> = {}): TokenEntity {
  return { id, kind: 'token', x: 100, y: 100, imagePath: `art/${id}.webp`, ...changes } as TokenEntity;
}

export interface Sent {
  readonly body: GmMessage;
  readonly to: string | undefined;
}

export interface ShareHarness {
  readonly share: SceneShare;
  readonly sent: Sent[];
  readonly notices: string[];
  /** The players' frame's perception of each token (the lighting with fog); unset sees all that are not hidden. */
  perception: TokenPerception | undefined;
  /** Whether the tab has a renderer. */
  rendered: boolean;
  /** Where the GM's lighting reads its rules, or null while it cannot be read. */
  lighting: LightingSource | null;
  settings: AtlasPlayerSettings;
  /** The tab's dice, read when the share starts; none by default. */
  dice: DiceSource | null;
  /** The tab's grid, doors, sensed tokens and collection; none by default. */
  layers: MapLayerSource | null;
  /** The map's resource and condition definitions, or null while they cannot be read (the default). */
  rules: TokenRules | null;
  /** What the GM's own drag ruler measures; none by default. */
  gmRuler: GmRuler | null;
  /** The rulers of the players' drags the GM's overlay was given, in order. */
  readonly playerDrags: (readonly RemoteDrag[])[];
  /** The rolls taken into the table's log. */
  readonly logged: LoggedRoll[];
  /** The roll buttons of the table's log, as a player may roll them; none by default. */
  requests: (from: string, answer: RollRequestAnswer) => RollRequest | null;
  /** The log entry of whoever found a readable pin; nobody by default. */
  foundPin: (mapPath: string, pinId: string) => string | null;
  set(next: SceneState): Promise<void>;
  /** Moves the clock on, running the timers that fall due, and lets reads settle. */
  advance(ms: number): Promise<void>;
  settle(): Promise<void>;
}

/** A 24-digit hex id from a counter, as random ids look. */
const counterId = (count: number): string => count.toString(16).padStart(24, '0');

/**
 * A SceneShare over a fake store, renderer (`fakeTokenSource`), vault and clock; `images` are the
 * vault's image files by path; `seats` tells who plays, owns which token and may claim which; `real`
 * (Atlas's own view store) replaces the fake store, and is written through its own actions, not `set`.
 */
export function shareHarness(initial: SceneState, images: ReadonlyMap<string, Uint8Array<ArrayBuffer>>, seats?: SeatSource, real?: SceneStore): ShareHarness {
  let current = initial;
  const listeners: ((next: SceneState) => void)[] = [];
  const store: SceneStore = real ?? {
    getState: () => current,
    setState: (recipe) => void harness.set(produce(current, recipe)),
    subscribe: (listener) => (listeners.push(listener), () => undefined),
  };
  const timers = new Map<number, { readonly at: number; readonly run: () => void }>();
  let now = 0;
  let timerIds = 0;
  let ids = 0;
  const settle = settled;
  const source = fakeTokenSource(() => store.getState(), () => harness.perception, () => GRID_SIZE);
  const harness: ShareHarness = {
    sent: [],
    notices: [],
    perception: undefined,
    rendered: true,
    lighting: GENERIC_SOURCE,
    settings: LIGHTING_ON,
    dice: null,
    layers: null,
    rules: null,
    gmRuler: null,
    playerDrags: [],
    logged: [],
    requests: () => null,
    foundPin: () => null,
    share: new SceneShare(store, {
      logRoll: (roll) => harness.logged.push(roll),
      rollRequest: (from, answer) => harness.requests(from, answer),
      foundPin: (mapPath, pinId) => harness.foundPin(mapPath, pinId),
      mapLayers: () => harness.layers,
      lightingSource: () => harness.lighting,
      atlasSettings: () => harness.settings,
      dice: () => harness.dice,
      showNames: () => harness.settings.showNames,
      tokenRules: () => harness.rules,
      tokenSource: () => (harness.rendered ? source : null),
      gmDragRuler: () => harness.gmRuler,
      showPlayerDrags: (drags) => harness.playerDrags.push(drags),
      readImage: (path) => {
        const bytes = images.get(path);
        const mime = imageMimeType(path);
        return Promise.resolve(bytes === undefined || mime === null ? null : { bytes, mime });
      },
      send: (body, to) => harness.sent.push({ body, to }),
      sendLive: (body) => harness.sent.push({ body, to: undefined }),
      notice: (text) => harness.notices.push(text),
      randomId: () => counterId((ids += 1)),
      now: () => now,
      setTimer: (run, ms) => {
        timerIds += 1;
        timers.set(timerIds, { at: now + ms, run });
        return timerIds;
      },
      clearTimer: (timer) => void timers.delete(timer),
      seats,
    }),
    set: async (next) => {
      current = next;
      for (const listener of listeners) listener(next);
      await settle();
    },
    advance: async (ms) => {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
        // What the timer started finishes at its time, before later timers run.
        await settle();
      }
      now = end;
      await settle();
    },
    settle,
  };
  return harness;
}

/** The scenes sent, in order. */
export const scenes = (sent: readonly Sent[]): unknown[] => sent.flatMap(({ body }) => (body.t === 'scene' ? [body.scene] : []));

/**
 * The messages of a sequenced kind players hold after each one sent of it, in order: a whole one as
 * sent, a delta as the whole message it makes (as a player's browser reads them).
 */
export function sequenced<K extends DeltaOf>(sent: readonly Sent[], of: K): Extract<GmMessage, { t: K }>[] {
  const reader = new DeltaReader();
  return sent.flatMap(({ body }) => {
    if (body.t !== of && !(body.t === 'delta' && body.of === of)) return [];
    const read = reader.read(parseGmMessage(JSON.parse(JSON.stringify(body))) ?? body);
    if (read === null || read === 'gap' || read.t !== of) throw new Error(`a ${of} message that does not follow on`);
    return [read as Extract<GmMessage, { t: K }>];
  });
}

/** The token lists players hold, in order. */
export const tokenLists = (sent: readonly Sent[]): Extract<GmMessage, { t: 'tokens' }>[] => sequenced(sent, 'tokens');
