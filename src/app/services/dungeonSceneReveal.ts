import { animate } from 'framer-motion';
import type { App } from 'obsidian';
import type { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';
import { takeReveal } from '../dungeons/reveal/pendingReveals';
import { scaledPlan } from '../dungeons/reveal/revealPlan';
import { playReveal } from '../dungeons/reveal/revealPlayer';
import { prefersReducedMotion } from '../utils/motion';
import { settledWithin } from '../utils/settledWithin';

/** The longest side the growing map is drawn at, in device pixels. */
const MAX_SIDE = 2400;
/** How long the loading screen waits for the map's picture; past it the scene opens as it is. */
const PICTURE_WAIT_MS = 1500;
/** The grown picture fades into the scene itself: its grid, pins and light come in with it. */
const SETTLE_MS = 450;

/**
 * Lets a new dungeon scene grow into being on its map the first time this device shows it (the
 * plan `createDungeonScene` noted): a canvas laid over the map's place on the view, kept on it
 * while the camera moves, plays the reveal from the map's own picture and then fades into the
 * scene. Null, at once, where the scene waits for none, or none can show (reduced motion, no map);
 * otherwise resolves, once the reveal's first frame stands over the map, with what ends it.
 * Shown to the GM alone, like the grid scan: the players' window renders the scene itself. Never
 * throws nor rejects: a reveal that fails leaves the scene to open as it is.
 */
export function revealNewDungeon(app: App, renderer: PixiRendererOrchestrator, scenePath: string, level: string | null): Promise<(() => void) | null> | null {
  const failed = (error: unknown): null => {
    console.warn('[Atlas] The new dungeon could not grow into being; it opens as it is', error);
    return null;
  };
  try {
    return startReveal(app, renderer, scenePath, level)?.catch(failed) ?? null;
  } catch (error) {
    return failed(error);
  }
}

function startReveal(app: App, renderer: PixiRendererOrchestrator, scenePath: string, level: string | null): Promise<(() => void) | null> | null {
  const pending = takeReveal(app, scenePath, level);
  const map = renderer.getMapImage();
  const viewport = renderer.getViewportInstance();
  const canvas = renderer.getCanvasElement();
  const rect = map?.worldRect;
  if (!pending || !map || !viewport || !rect || prefersReducedMotion(canvas)) return null;
  const ratio = canvas.ownerDocument.defaultView?.devicePixelRatio || 1;
  const side = Math.max(1, Math.min(MAX_SIDE, Math.ceil(Math.max(rect.width, rect.height) * viewport.scale.x * ratio)));

  return (async (): Promise<(() => void) | null> => {
    const picture = map.overview(side);
    if (!(await settledWithin(picture, PICTURE_WAIT_MS))) {
      void picture.then((late) => late?.close(), () => undefined);
      return null;
    }
    const bitmap = await picture.catch(() => null);
    if (!bitmap) return null;

    const { renderer: pixiRenderer, ticker } = renderer.getAppInstance();
    const overlay = createEl('canvas', { cls: 'atlas-dungeon-scene-reveal', attr: { 'aria-hidden': 'true' } });
    // Where the map has not come into being yet, the view's own ground shows
    overlay.style.backgroundColor = pixiRenderer.background.color.toHex();
    canvas.insertAdjacentElement('afterend', overlay);
    const place = (): void => {
      const world = map.worldRect;
      if (!world) return;
      const at = viewport.toScreen(world.x, world.y);
      overlay.style.width = `${world.width * viewport.scale.x}px`;
      overlay.style.height = `${world.height * viewport.scale.y}px`;
      overlay.style.transform = `translate(${at.x}px, ${at.y}px)`;
    };
    place();
    ticker.add(place);

    let ended = false;
    let settle: { stop: () => void } | null = null;
    const remove = (): void => {
      if (ended) return;
      ended = true;
      ticker.remove(place);
      overlay.remove();
      bitmap.close();
    };
    const plan = scaledPlan(pending.plan, bitmap.width / pending.width, bitmap.height / pending.height);
    let stop: () => void;
    try {
      stop = playReveal(overlay, bitmap, plan, () => {
        if (ended) return;
        settle = animate(overlay, { opacity: 0 }, { duration: SETTLE_MS / 1000, ease: 'easeOut', onComplete: remove });
      });
    } catch (error) {
      remove();
      throw error;
    }
    return () => {
      stop();
      settle?.stop();
      remove();
    };
  })();
}
