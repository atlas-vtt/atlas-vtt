import { UPDATE_PRIORITY, type Application, type RenderGroup, type Ticker } from 'pixi.js';

/** Runs right before a stage render, with the time of the display frame being rendered. */
export type BeforeRenderHook = (frameTime: number) => void;

const schedulers = new WeakMap<Application, RenderScheduler>();

/** Where a before-render hook runs among the others: lower first. */
export const BEFORE_RENDER_ORDER = {
  /** The roof of the level a view shows takes in the lighting's sight before anything is drawn (`ViewRoofs`). */
  roofs: -1,
  /** The player window's frame (`PlayerFrameMirror`), rendered on the canvas before the GM's own. */
  playerFrame: 0,
  /** The levels below the view seen through its openings, drawn for the GM's own render (`LevelsBelow`). */
  levelsBelow: 1,
} as const;

interface Hook {
  run: BeforeRenderHook;
  order: number;
  failed: boolean;
}

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
  /** The hooks in the order they run. */
  private hooks: Hook[] = [];
  /** The hook `setBeforeRender` holds: one at a time. */
  private primary: Hook | null = null;
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
   * is replaced by that render before the browser composites. One hook at a time, which runs first
   * (`BEFORE_RENDER_ORDER.playerFrame`); returns the function that removes it.
   */
  public setBeforeRender(hook: BeforeRenderHook): () => void {
    if (this.primary) this.remove(this.primary);
    const added = this.add(hook, BEFORE_RENDER_ORDER.playerFrame);
    this.primary = added;
    return (): void => {
      if (this.primary !== added) return;
      this.primary = null;
      this.remove(added);
    };
  }

  /** Run `hook` right before each stage render, after the hooks of a lower `order`; returns the function that removes it. */
  public addBeforeRender(hook: BeforeRenderHook, order: number): () => void {
    const added = this.add(hook, order);
    return (): void => this.remove(added);
  }

  public destroy(): void {
    this.app.ticker?.remove(this.renderIfChanged);
    this.app.renderer?.runners.contextChange.remove(this.contextChangeListener);
    this.hooks = [];
    this.primary = null;
    schedulers.delete(this.app);
  }

  private add(run: BeforeRenderHook, order: number): Hook {
    const hook = { run, order, failed: false };
    // After every hook of its order or lower: hooks of one order run in the order they came.
    const at = this.hooks.findIndex((other) => other.order > order);
    this.hooks = at < 0 ? [...this.hooks, hook] : [...this.hooks.slice(0, at), hook, ...this.hooks.slice(at)];
    return hook;
  }

  private remove(hook: Hook): void {
    this.hooks = this.hooks.filter((other) => other !== hook);
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

  /** A throwing hook must not skip the render or the hooks after it, nor end the ticker, which stops at an uncaught error. */
  private runBeforeRender(frameTime: number): void {
    for (const hook of this.hooks) {
      try {
        hook.run(frameTime);
      } catch (error) {
        if (!hook.failed) console.error('[RenderScheduler] A before-render hook failed:', error);
        hook.failed = true;
      }
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

/**
 * Run `hook` right before each stage render of `app`, after the hooks of a lower `order`
 * (`BEFORE_RENDER_ORDER`). Returns the function that removes it; does nothing for apps without a scheduler.
 */
export function addBeforeRender(app: Application, hook: BeforeRenderHook, order: number): () => void {
  return schedulers.get(app)?.addBeforeRender(hook, order) ?? ((): void => undefined);
}

/** Whether `group` or a nested render group holds updates that the next render would apply. */
export function hasPendingChanges(group: RenderGroup): boolean {
  if (group.structureDidChange || group.childrenRenderablesToUpdate.index > 0) return true;
  if (Object.values(group.childrenToUpdate).some((pending) => pending.index > 0)) return true;
  return group.renderGroupChildren.some(hasPendingChanges);
}
