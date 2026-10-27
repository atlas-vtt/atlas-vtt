import { animate, type AnimationOptions } from 'framer-motion';
import { UPDATE_PRIORITY, type Application } from 'pixi.js';
import type { ViewAtlasStore, ViewAtlasState } from '../storeFactory';
import type { MapImage } from './mapImage/MapImage';
import { MapController } from '../MapController';
import { viewedLevelId } from '../levels/sceneLevels';
import { prefersReducedMotion } from '../utils/motion';
import { captureSceneTransition, type FrameMotion, type SceneTransition } from './sceneTransition';

/** How long a switch may hold the last frame for the new level's image and the tiles in view. */
const LEVEL_READY_MS = 800;
/**
 * How far a floor moves in depth: going up, the floor left behind sinks away while the one above
 * arrives from a little closer; going down, the reverse. The player page's floors move alike.
 */
const DEPTH = 0.04;
/** Spelled out: Motion reads `none` as a transform of zeros. */
const AT_REST = 'scale(1)';
/** One critically damped spring for the fade and the depth, so the floors dissolve as they move. */
const MOVE: AnimationOptions = { type: 'spring', duration: 0.5, bounce: 0 };

/** What the hold needs of the view's renderer, read when a switch happens (the app exists once a map is loaded). */
export interface LevelPictureSource {
  getAppInstance(): Application;
  getMapImage(): MapImage | null;
}

/**
 * Keeps the last frame of the level the view showed while the next one is put together (its
 * image, the tiles in view), then moves from one floor to the other in depth. Bind it before the
 * view's renderers subscribe to the store: the frame is captured in the listener, before they
 * have drawn anything of the new level. A load holds its own frame (`bindMapLoadingFrameHold`).
 *
 * @returns Unbinds the hold, drops its frames and resumes rendering.
 */
export function bindLevelSwitchTransition(store: ViewAtlasStore, source: LevelPictureSource): () => void {
  /** Frame captured for the switch in progress, and the level it shows. */
  let pending: { frame: SceneTransition; from: string } | null = null;
  /** Frame still moving out after the previous switch. */
  let fading: SceneTransition | null = null;
  /** The app stopped to hold the frame. */
  let held: Application | null = null;
  /** Counts switches, so only the newest one's readiness plays the motion. */
  let switches = 0;

  const resume = (): void => {
    held?.start();
    held = null;
  };

  const drop = (): void => {
    switches++;
    pending?.frame.cancel();
    pending = null;
    resume();
  };

  const finish = (): void => {
    if (!pending) return;
    const { frame, from } = pending;
    const app = held;
    pending = null;
    fading = frame;
    resume();
    const play = (): void => {
      if (fading === frame) frame.play(floorMotion(direction(store.getState(), from)));
    };
    // The first render of the new level is the heavy one: the motion starts after it, not under it
    if (app?.ticker) app.ticker.addOnce(play, undefined, UPDATE_PRIORITY.UTILITY);
    else play();
  };

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.isMapLoading) {
      // Released before the load's own hold looks at the ticker
      if (!prev.isMapLoading) drop();
      return;
    }
    const to = viewedLevelId(state);
    const from = viewedLevelId(prev);
    if (!state.mapLoaded || !prev.mapLoaded || to === from || to === null || from === null) return;

    const app = source.getAppInstance();
    if (!pending) {
      // Something else holds the canvas (a load handing over to its overlay)
      if (!app.ticker?.started) return;
      const frame = captureSceneTransition(app, fading);
      fading = null;
      if (!frame) return;
      pending = { frame, from };
      held = app;
      app.stop();
    }
    const id = ++switches;
    void whenLevelDrawn(store, source.getMapImage(), LEVEL_READY_MS).then(() => {
      if (id === switches) finish();
    });
  });

  return (): void => {
    unsubscribe();
    drop();
    fading?.cancel();
    fading = null;
  };
}

type Direction = 'up' | 'down' | 'none';

/** Which way the view went from level `from` to the one it shows: levels are listed bottom first. */
function direction(state: ViewAtlasState, from: string): Direction {
  const levels = state.levels ?? [];
  const before = levels.findIndex((level) => level.id === from);
  const after = levels.findIndex((level) => level.id === viewedLevelId(state));
  if (before < 0 || after < 0 || before === after) return 'none';
  return after > before ? 'up' : 'down';
}

/** The last frame moves away in depth and fades while the canvas settles in from the other side; reduced motion crossfades. */
function floorMotion(way: Direction): FrameMotion {
  return (frame, target, done) => {
    const still = way === 'none' || prefersReducedMotion(target);
    const away = way === 'up' ? 1 - DEPTH : 1 + DEPTH;
    const toward = way === 'up' ? 1 + DEPTH : 1 - DEPTH;
    const animations = [animate(frame, { opacity: [1, 0] }, MOVE)];
    if (!still) {
      animations.push(
        animate(frame, { transform: [AT_REST, `scale(${away})`] }, MOVE),
        animate(target, { transform: [`scale(${toward})`, AT_REST] }, MOVE),
      );
    }
    void Promise.all(animations).then(done);
    return (): void => {
      for (const animation of animations) animation.stop();
      target.setCssStyles({ transform: '' });
    };
  };
}

/** Resolves once the map image shows the viewed level's background and the tiles in view are drawn, or after `timeoutMs`. */
async function whenLevelDrawn(store: ViewAtlasStore, mapImage: MapImage | null, timeoutMs: number): Promise<void> {
  if (!mapImage) return;
  const deadline = performance.now() + timeoutMs;
  await whenImageShown(store, mapImage, timeoutMs);
  const left = deadline - performance.now();
  if (left > 0) await mapImage.whenCameraReady(left);
}

function whenImageShown(store: ViewAtlasStore, mapImage: MapImage, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const shown = (): boolean => MapController.showsViewedLevel(mapImage, store.getState());
    if (shown()) {
      resolve();
      return;
    }
    const done = (): void => {
      off();
      window.clearTimeout(timer);
      resolve();
    };
    const off = MapController.onBackgroundLoaded((loaded) => {
      if (loaded === mapImage && shown()) done();
    });
    const timer = window.setTimeout(done, timeoutMs);
  });
}
