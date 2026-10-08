import { vi } from 'vitest';
import type { PlayerCameraState } from '../../src/app/local-player-view';
import { RenderScheduler, requestRender, setBeforeRender } from '../../src/app/pixi/RenderScheduler';
import { captureBeforeRender, captureWithLayerVisibility, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { PlayerFrameMirror, type PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import type { AtlasSettings } from '../../src/app/services/SettingsService';
import { fakeApp, fakeGroup } from './schedulerApp';

export const SETTINGS = { showTokenNameplates: true } as AtlasSettings['localPlayerView'];
export const DM_CAMERA: PlayerCameraState = { centerX: 1, centerY: 2, scale: 1 };

export interface Dm {
  source: PlayerFrameSource;
  /** A display frame of the DM window at `time`. */
  tick(time: number): void;
  /** Something on the DM's stage changed. */
  change(): void;
  /** The view's scene starts or finishes loading (`isMapLoading` in the source's store). */
  setLoading(loading: boolean): void;
  scheduler: RenderScheduler;
}

export interface MirrorHarness {
  mirror: PlayerFrameMirror;
  /** Renders and captures in order; a capture names the frame the canvas held. */
  events: string[];
  /** A display frame of the player window at `time`. */
  frame(time: number): void;
  dm: Dm;
  createDm(): Dm;
  state: { source: PlayerFrameSource | null; held: HTMLCanvasElement | null; frozen: PlayerCameraState | null };
  onFrame: ReturnType<typeof vi.fn>;
  captureFails: { value: boolean };
}

/** A mirror on a fake DM canvas that renders on change; times are fed by hand. */
export function setupMirror(): MirrorHarness {
  const events: string[] = [];
  const captureFails = { value: false };
  let onCanvas = 'nothing';
  let now = 0;

  /** A DM canvas rendering on change, whose pins are hidden from players. */
  function createDm(): Dm {
    const group = fakeGroup();
    // PIXI queues a render-group update when a layer is shown or hidden
    const pins = {
      shown: true,
      get visible(): boolean { return this.shown; },
      set visible(value: boolean) { this.shown = value; group.structureDidChange = true; },
    };
    const render = (): void => {
      onCanvas = pins.visible ? 'dm' : 'player';
      events.push(`render:${onCanvas}`);
      group.structureDidChange = false;
    };
    const { app, ticker } = fakeApp(group, render);
    const scheduler = new RenderScheduler(app);
    const layers: LayerVisibility[] = [{ layer: pins, visible: false }];
    const canvas = document.createElement('canvas');
    let loading = false;
    const store = { getState: () => ({ isMapLoading: loading }) } as unknown as NonNullable<PlayerFrameSource['store']>;
    const source: PlayerFrameSource = {
      canvas,
      store,
      getCamera: () => DM_CAMERA,
      withPlayerSafeFrame: (capture) => captureWithLayerVisibility(layers, render, capture),
      beforeRender: {
        listen: (listener) => setBeforeRender(app, listener),
        requestRender: () => requestRender(app),
        withPlayerSafeFrame: (capture) => captureBeforeRender(layers, render, capture),
      },
    };
    return {
      source,
      scheduler,
      tick: (time) => ticker.update(time),
      change: () => { group.structureDidChange = true; },
      setLoading: (value) => { loading = value; },
    };
  }

  const dm = createDm();
  const state: MirrorHarness['state'] = { source: dm.source, held: null, frozen: null };
  const target = document.createElement('canvas');
  const context = {
    clearRect: vi.fn(),
    drawImage: (image: HTMLCanvasElement): void => {
      if (captureFails.value) throw new Error('lost context');
      events.push(image === state.held ? 'draw:held' : `capture:${onCanvas}`);
    },
  } as unknown as CanvasRenderingContext2D;
  const onFrame = vi.fn();
  const mirror = new PlayerFrameMirror(target, context, {
    source: () => state.source,
    heldFrame: () => state.held,
    frozenCamera: () => state.frozen,
    settings: () => SETTINGS,
    onFrame,
  }, () => now);
  return { mirror, events, dm, createDm, state, onFrame, captureFails, frame: (time) => { now = time; mirror.frame(); } };
}

/** What one mirrored frame costs: the player frame, its copy, then the DM's own render. */
export const MIRRORED = ['render:player', 'capture:player', 'render:dm'];

/** A harness whose first frame is already on the players' screen. */
export function mirroring(): MirrorHarness {
  const harness = setupMirror();
  harness.frame(0);
  harness.dm.tick(1);
  harness.events.length = 0;
  harness.onFrame.mockClear();
  return harness;
}
