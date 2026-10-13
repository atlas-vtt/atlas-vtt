import { UPDATE_PRIORITY, type Application, type RenderGroup, type Ticker } from 'pixi.js';

/** Runs right before a stage render, with the time of the display frame being rendered. */
export type BeforeRenderHook = (frameTime: number) => void;

const schedulers = new WeakMap<Application, RenderScheduler>();

/**
 * Renders the stage only when it changed, instead of on every display frame.
 *
 * PIXI's `Application` redraws the whole stage on every tick, which kept the GPU busy
 * at the display's refresh rate while the map sat idle. The scheduler takes over that
 * ticker slot and reads PIXI's render-group bookkeeping (moved, added, removed or
 * hidden children and updated Graphics, Sprites or Text), which the next render
 * consumes anyway. Ticker callbacks such as animations keep running; whatever they
 * change on the stage is picked up the same way.
 *
 * Changes PIXI cannot see must call {@link requestRender}: pixels uploaded into an
 * existing texture (`source.update()`), hand-animated filter properties and renderer
 * settings such as the background colour.
 */
export class RenderScheduler {
  private renderRequested = true;
  private beforeRender: BeforeRenderHook | null = null;
  private hookFailed = false;
  private readonly contextChangeListener = { contextChange: (): void => this.requestRender() };

  constructor(private readonly app: Application) {
    // The Application registered `render` with itself as context; that exact pair removes it
    const renderOwner: { readonly render: () => void } = app;
    app.ticker.remove(renderOwner.render, app);
    app.ticker.add(this.renderIfChanged, undefined, UPDATE_PRIORITY.LOW);
    // A restored WebGL context starts out blank
    app.renderer.runners.contextChange.add(this.contextChangeListener);
    schedulers.set(app, this);
  }

  /** Render on the next tick even if the stage looks unchanged. */
  public requestRender(): void {
    this.renderRequested = true;
  }

  /**
   * Render now, in this task: for what clears the canvas between the frame's render and the
   * browser's paint (a resize from a `ResizeObserver`), which would otherwise show as a blank frame.
   * While the ticker is stopped (a load holding the last frame) the render waits for the next tick.
   */
  public renderNow(): void {
    if (!this.app.ticker?.started) {
      this.requestRender();
      return;
    }
    this.render(performance.now());
  }

  /**
   * Run `hook` right before each stage render, in the same task: whatever it draws on the canvas
   * is replaced by that render before the browser composites. One hook at a time; returns the
   * function that removes it.
   */
  public setBeforeRender(hook: BeforeRenderHook): () => void {
    this.beforeRender = hook;
    this.hookFailed = false;
    return (): void => {
      if (this.beforeRender === hook) this.beforeRender = null;
    };
  }

  public destroy(): void {
    this.app.ticker?.remove(this.renderIfChanged);
    this.app.renderer?.runners.contextChange.remove(this.contextChangeListener);
    this.beforeRender = null;
    schedulers.delete(this.app);
  }

  private readonly renderIfChanged = (ticker: Ticker): void => {
    const group = this.app.stage.renderGroup;
    if (!this.renderRequested && group && !hasPendingChanges(group)) return;
    // `lastTime` is still the previous frame's while the ticker runs its callbacks
    this.render(ticker.lastTime + ticker.elapsedMS);
  };

  private render(frameTime: number): void {
    this.runBeforeRender(frameTime);
    // Cleared after the hook: the render below shows whatever the hook changed or requested
    this.renderRequested = false;
    this.app.render();
  }

  /** A throwing hook must not skip the render, nor end the ticker, which stops at an uncaught error. */
  private runBeforeRender(frameTime: number): void {
    try {
      this.beforeRender?.(frameTime);
    } catch (error) {
      if (!this.hookFailed) console.error('[RenderScheduler] The before-render hook failed:', error);
      this.hookFailed = true;
    }
  }
}

/** Ask `app`'s scheduler for a render on the next tick. Does nothing for apps without one. */
export function requestRender(app: Application): void {
  schedulers.get(app)?.requestRender();
}

/** Whether `app` renders only when its stage changed, through a scheduler, rather than on every tick. */
export function rendersOnChange(app: Application): boolean {
  return schedulers.has(app);
}

/**
 * Run `hook` right before each stage render of `app` (see {@link RenderScheduler.setBeforeRender}).
 * Returns the function that removes it; does nothing for apps without a scheduler.
 */
export function setBeforeRender(app: Application, hook: BeforeRenderHook): () => void {
  return schedulers.get(app)?.setBeforeRender(hook) ?? ((): void => undefined);
}

/** Whether `group` or a nested render group holds updates that the next render would apply. */
export function hasPendingChanges(group: RenderGroup): boolean {
  if (group.structureDidChange || group.childrenRenderablesToUpdate.index > 0) return true;
  if (Object.values(group.childrenToUpdate).some((pending) => pending.index > 0)) return true;
  return group.renderGroupChildren.some(hasPendingChanges);
}
