import type { Application, Container, Renderer } from 'pixi.js';
import { PlayerFrameTexture } from '../../src/app/pixi/PlayerFrameTexture';
import { captureBeforeRender, frameCamera, type CameraTarget, type LayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { rendersOnChange, requestRender, setBeforeRender } from '../../src/app/pixi/RenderScheduler';
import { PlayerFrameMirror, type MirrorInputs, type PlayerFrameSource } from '../../src/app/services/PlayerFrameMirror';
import { viewportCamera } from '../../src/app/services/playerFrame';
import type { PlayerCameraState } from '../../src/app/types/playerCamera';
import type { FramePiece, PlayerFrame, Screen } from '../../src/app/types/playerFrame';

/** The viewport of a map view, as far as a players' frame reads and moves it. */
export type FrameViewport = CameraTarget & Parameters<typeof viewportCamera>[0];

export interface FrameView {
  renderer: Renderer;
  /** What a frame renders: the app's stage. */
  stage: Container;
  /** What the players' camera moves. */
  viewport: CameraTarget;
  /** The DM's camera and screen, read for every frame; `viewOf` reads both off a real viewport. */
  camera(): PlayerCameraState;
  screen(): Screen;
  /** What the players' frame hides, read for every frame. */
  layers?: () => LayerVisibility[];
  store?: PlayerFrameSource['store'];
  /** An app that renders on change: the frame is then captured right before its renders. */
  app?: Application;
  /** Called while the players' frame stands rendered, before its pixels are handed out. */
  onRendered?: () => void;
}

/** The camera and screen of a real viewport, for `playerFrameSource`. */
export function viewOf(viewport: FrameViewport, renderer: Renderer): Pick<FrameView, 'viewport' | 'camera' | 'screen'> {
  return {
    viewport,
    camera: () => viewportCamera(viewport),
    screen: () => ({ width: viewport.screenWidth, height: viewport.screenHeight, resolution: renderer.resolution }),
  };
}

/**
 * What a map view offers the player window, composed as `PixiRendererOrchestrator` and
 * `PlayerWindowPresenter` compose it, on a real renderer: the frame texture, the players' layers
 * and camera around its render, and the DM's own frame rendered again where no render follows.
 */
export function playerFrameSource(view: FrameView): { source: PlayerFrameSource; frames: PlayerFrameTexture } {
  const { renderer, stage, app } = view;
  const frames = new PlayerFrameTexture(renderer);
  const draw = (copy: (piece: FramePiece) => void, frame: PlayerFrame, renderFollows: boolean): void => {
    if (!frames.canRender()) return;
    try {
      captureBeforeRender(view.layers?.() ?? [], () => frames.render(stage, frame), () => {
        view.onRendered?.();
        frames.copy(copy);
      }, frameCamera(view.viewport, frame));
    } finally {
      if (!renderFollows) renderer.render({ container: stage });
    }
  };
  const source: PlayerFrameSource = {
    ...(view.store ? { store: view.store } : {}),
    getCamera: view.camera,
    getScreen: view.screen,
    canRender: () => frames.canRender(),
    withPlayerSafeFrame: (copy, _settings, frame) => draw(copy, frame, false),
    ...(app && rendersOnChange(app) ? {
      beforeRender: {
        listen: (listener) => setBeforeRender(app, listener),
        requestRender: () => requestRender(app),
        withPlayerSafeFrame: (copy, _settings, frame) => draw(copy, frame, true),
      },
    } : {}),
    release: () => frames.release(),
  };
  return { source, frames };
}

/** The frame sources of these tests read no player view settings. */
const SETTINGS = { showTokenNameplates: true } as ReturnType<MirrorInputs['settings']>;

export interface PlayerWindowHarness {
  mirror: PlayerFrameMirror;
  target: HTMLCanvasElement;
  state: { window: Screen | null; frozen: PlayerCameraState | null; held: HTMLCanvasElement | null; source: PlayerFrameSource | null };
  /** The frames the players' canvas was given, by the camera they were seen through. */
  frames: Array<PlayerCameraState | undefined>;
  /** A display frame of the player window. */
  frame(): void;
  /** The players' canvas, pixel by pixel. */
  pixels(): Uint8ClampedArray;
  /** The colour at a pixel of the players' canvas. */
  at(x: number, y: number): number[];
}

/** A player window of `window`'s size that is shown `source`, with a real 2D canvas. */
export function playerWindow(source: PlayerFrameSource, window: Screen, now: () => number = () => performance.now()): PlayerWindowHarness {
  const target = document.createElement('canvas');
  const context = target.getContext('2d', { willReadFrequently: true })!;
  const state: PlayerWindowHarness['state'] = { window, frozen: null, held: null, source };
  const frames: PlayerWindowHarness['frames'] = [];
  const mirror = new PlayerFrameMirror(target, context, {
    source: () => state.source,
    window: () => state.window,
    heldFrame: () => state.held,
    frozenCamera: () => state.frozen,
    settings: () => SETTINGS,
    onFrame: (camera) => { frames.push(camera); },
  }, now);
  return {
    mirror, target, state, frames,
    frame: () => mirror.frame(),
    pixels: () => context.getImageData(0, 0, target.width, target.height).data,
    at: (x, y) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3)),
  };
}

/** The first pixel at which two pictures of `width` differ, for a message that says where; null where they are the same. */
export function firstDifference(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number): string | null {
  if (a.length !== b.length) return `sizes differ: ${a.length / 4} and ${b.length / 4} pixels`;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
      const pixel = i / 4;
      return `pixel (${pixel % width}, ${Math.floor(pixel / width)}): ${a[i]},${a[i + 1]},${a[i + 2]} and ${b[i]},${b[i + 1]},${b[i + 2]}`;
    }
  }
  return null;
}
