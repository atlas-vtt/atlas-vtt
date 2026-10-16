import { MARKS_INTERVAL_MS } from '../protocol/index.ts';
import { Application, Container } from 'pixi.js';
import { getDomHost } from '../../host/dom';
import { RemoteDrags, type RemoteDrag } from './RemoteDrags.ts';
import { RemoteLasers, type RemoteLaser } from './RemoteLasers.ts';
import { RemoteMeasures, type MeasureRules, type RemoteMeasure } from './RemoteMeasures.ts';

/** Marks to draw: lasers and measurements, each by its sender, and the rulers of drags made elsewhere. */
export interface Marks {
  readonly lasers: readonly RemoteLaser[];
  readonly measures: readonly RemoteMeasure[];
  readonly drags?: readonly RemoteDrag[];
}

/** Where Atlas draws a map: its canvas and the viewport's camera (Atlas's own copy of PIXI, read only). */
export interface OverlayHost {
  readonly canvas: HTMLCanvasElement;
  readonly viewport: {
    /** Set once Atlas destroyed the viewport (its renderer was built anew or its view closed). */
    readonly destroyed?: boolean;
    readonly x: number;
    readonly y: number;
    readonly scale: { readonly x: number; readonly y: number };
    on(event: 'moved' | 'zoomed', listener: () => void): unknown;
    off(event: 'moved' | 'zoomed', listener: () => void): unknown;
  };
}

/** Frames drawn with nothing left to animate before the overlay stops its ticker. */
const IDLE_FRAMES = 2;

/**
 * Marks drawn on a transparent canvas of their own, laid over another PIXI application's canvas
 * (Atlas's, which runs its own copy of PIXI that this one must not draw into). It lets every pointer
 * event through (`.atlas-online-marks`), follows the other viewport's camera, and draws only while
 * something moves. Its canvas and WebGL context are made with the first marks to show.
 */
export class MarkOverlay {
  private readonly rules: () => MeasureRules | null;
  private app: Application | null = null;
  private starting: Promise<void> | null = null;
  private world: Container | null = null;
  private lasers: RemoteLasers | null = null;
  private measures: RemoteMeasures | null = null;
  private drags: RemoteDrags | null = null;
  private host: OverlayHost | null = null;
  private marks: Marks = { lasers: [], measures: [] };
  private idle = 0;
  private zoom = 1;
  private disposed = false;
  /**
   * The camera moved: the marks follow it at once, drawn now, since the map's own frame moved it (a
   * smooth zoom's step) or a scroll event did, and the overlay's frame, before or after the map's in
   * the same display frame, would draw them by the camera of the frame before as often as not.
   */
  private readonly onCamera = (): void => {
    const shown = this.lasers?.busy === true || this.marks.measures.length > 0 || this.drags?.showing === true;
    if (shown && this.followCamera()) this.app?.render();
    this.wake();
  };
  private readonly resized = new ResizeObserver(() => this.wake());

  constructor(rules: () => MeasureRules | null) {
    this.rules = rules;
  }

  /** Shows the players' marks over `host`'s map. */
  show(marks: Marks, host: OverlayHost): void {
    this.marks = marks;
    const empty = marks.lasers.length === 0 && marks.measures.length === 0 && (marks.drags?.length ?? 0) === 0;
    if (this.app === null) {
      if (!empty && this.starting === null) {
        this.start(host).catch((error: unknown) => console.error('Atlas Online: the marks overlay could not start, so players\' marks are not drawn.', error));
      }
      return;
    }
    this.attach(host);
    const now = performance.now();
    this.lasers?.update(marks.lasers, now);
    this.measures?.update(marks.measures, now);
    this.drags?.update(marks.drags ?? []);
    this.wake();
  }

  dispose(): void {
    this.disposed = true;
    this.detach();
    this.lasers?.destroy();
    this.measures?.destroy();
    this.drags?.destroy();
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
  }

  private async start(host: OverlayHost): Promise<void> {
    this.starting ??= (async () => {
      const app = new Application();
      const canvas = getDomHost().createCanvas(host.canvas.ownerDocument);
      canvas.classList.add('atlas-online-marks');
      await app.init({ canvas, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1, autoStart: false, width: 1, height: 1 });
      if (this.disposed) {
        app.destroy({ removeView: true });
        return;
      }
      const world = new Container({ sortableChildren: true });
      app.stage.addChild(world);
      this.lasers = new RemoteLasers(app.renderer, () => this.zoom, MARKS_INTERVAL_MS);
      this.measures = new RemoteMeasures(() => this.zoom, this.rules, MARKS_INTERVAL_MS);
      this.drags = new RemoteDrags(() => this.zoom, this.rules);
      world.addChild(this.drags.paths, this.measures.container, this.lasers.container, this.drags.labels);
      app.ticker.add(() => this.tick());
      this.app = app;
      this.world = world;
    })();
    await this.starting;
    if (this.app !== null) this.show(this.marks, host);
  }

  /** Lays the overlay over `host`'s canvas and follows its camera; a new canvas (Atlas built its renderer anew) moves it. */
  private attach(host: OverlayHost): void {
    if (this.host?.canvas === host.canvas && this.host.viewport === host.viewport) return;
    this.detach();
    this.host = host;
    const canvas = this.app?.canvas;
    if (canvas !== undefined) host.canvas.after(canvas);
    this.resized.observe(host.canvas);
    host.viewport.on('moved', this.onCamera);
    host.viewport.on('zoomed', this.onCamera);
  }

  private detach(): void {
    this.resized.disconnect();
    this.host?.viewport.off('moved', this.onCamera);
    this.host?.viewport.off('zoomed', this.onCamera);
    this.host = null;
  }

  private wake(): void {
    this.idle = 0;
    if (this.app !== null && !this.app.ticker.started) this.app.ticker.start();
  }

  /** Lays the marks under the map's camera as it is now; false while there is no live map to follow. */
  private followCamera(): boolean {
    const { world, host } = this;
    if (world === null || host === null || host.viewport.destroyed === true) return false;
    world.position.set(host.viewport.x, host.viewport.y);
    world.scale.set(host.viewport.scale.x, host.viewport.scale.y);
    if (host.viewport.scale.x !== this.zoom) {
      this.zoom = host.viewport.scale.x;
      this.measures?.rescale();
      this.drags?.rescale();
    }
    return true;
  }

  private tick(): void {
    const { app, world, host } = this;
    if (app === null || world === null || host === null) return;
    // Atlas destroyed the map under the overlay: let it go until marks are shown over a live one.
    if (host.viewport.destroyed === true || !host.canvas.isConnected) {
      this.detach();
      app.ticker.stop();
      return;
    }
    const { clientWidth: width, clientHeight: height } = host.canvas;
    if (width !== app.screen.width || height !== app.screen.height) app.renderer.resize(width, height);
    this.followCamera();
    const now = performance.now();
    this.lasers?.tick(now);
    this.measures?.tick(now);
    // A pointer or an end still on its way to where its sender left it keeps the frames coming.
    if (this.lasers?.busy !== true && this.measures?.busy !== true) this.idle += 1;
    if (this.idle >= IDLE_FRAMES) app.ticker.stop();
  }
}
