import { Container, type Ticker } from 'pixi.js';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { TokenInput } from '../../types/viewState';
import type { GridSystem } from '../../grid/GridSystem';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import { prefersReducedMotion } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { PlacementGhost, type TokenPreview } from './PlacementGhost';
import { PlacementMarks } from './PlacementMarks';
import { QueueCount } from './QueueCount';
import { PlacementSession, type HeldToken } from './PlacementSession';
import { bindPlacementInput, type PlacementInputDeps } from './placementInput';
import { placementGridOf } from './placementGrid';

/** Tokens to put in the GM's hand, laid out as they should land, and how the scene takes them. */
export interface PlacementRequest {
  tokens: readonly TokenInput[];
  /** Adds tokens as they are put down, in one store write, and returns their ids. */
  commit(tokens: TokenInput[]): string[];
}

export interface TokenPlacerDeps extends PlacementInputDeps {
  store: StoreApi<ViewAtlasState>;
  grid(): GridSystem | null;
  /** The token drawn as it will be placed (`TokenRenderer.previewToken`). */
  previewToken(token: TokenInput): Promise<TokenPreview>;
}

/**
 * Lets the GM place spawned tokens by hand on one view's map (`PlacementSession`). Owns the layers
 * the held tokens and their marks are drawn in, which belong to the GM alone: players, their window
 * and pictures of the scene never show them (`layers`), and nothing reaches the scene before a
 * token is put down. One placement at a time: a new one puts the tokens of the last away.
 */
export class TokenPlacer {
  private readonly ghostLayer = new Container();
  private readonly marks: PlacementMarks;
  private readonly queueCount: QueueCount;
  /** Ghosts no longer in a hand that finish landing or vanishing. */
  private readonly leaving = new Set<PlacementGhost>();
  private session: PlacementSession | null = null;
  private held: HeldToken[] = [];
  private unbind: (() => void) | null = null;
  private stopWatchingStore: (() => void) | null = null;
  private ticking = false;
  /** Counts placements, so one whose previews arrive after another began is dropped. */
  private generation = 0;
  private destroyed = false;
  private accentColour: number | null = null;

  constructor(private readonly deps: TokenPlacerDeps) {
    const reduced = prefersReducedMotion(deps.canvas);
    this.marks = new PlacementMarks(() => this.accent(), () => deps.viewport.scale.x, reduced);
    this.queueCount = new QueueCount(() => deps.viewport.scale.x, reduced);
    this.ghostLayer.eventMode = 'none';
    this.ghostLayer.sortableChildren = true;
    this.queueCount.root.zIndex = 2;
    this.ghostLayer.addChild(this.queueCount.root);
    this.ghostLayer.zIndex = MAP_LAYER_Z.placement;
    this.marks.container.zIndex = MAP_LAYER_Z.placementCells;
    deps.viewport.addChild(this.marks.container, this.ghostLayer);
  }

  /** Whether tokens are in the GM's hand. */
  get active(): boolean {
    return this.session?.active ?? false;
  }

  /** The layers players must never see: hidden in their frames and in pictures of the scene. */
  get layers(): Container[] {
    return [this.ghostLayer, this.marks.container];
  }

  /**
   * Puts `request.tokens` in the GM's hand and resolves, once the last is put down or the rest put
   * away, with the ids of every token placed (none when the GM put them all away).
   */
  async place(request: PlacementRequest): Promise<string[]> {
    this.cancel();
    const generation = ++this.generation;
    const previews = await Promise.all(request.tokens.map((token) => this.deps.previewToken(token)));
    if (this.destroyed || generation !== this.generation) {
      for (const preview of previews) preview.release();
      return [];
    }
    return new Promise((resolve) => this.begin(request, previews, resolve));
  }

  /** Puts the tokens in the GM's hand away. */
  cancel(): void {
    this.generation++;
    this.session?.cancel();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.cancel();
    this.destroyed = true;
    this.setTicking(false);
    for (const ghost of this.leaving) ghost.destroy();
    this.leaving.clear();
    this.marks.destroy();
    this.queueCount.destroy();
    destroyTree(this.ghostLayer);
  }

  private begin(request: PlacementRequest, previews: TokenPreview[], resolve: (ids: string[]) => void): void {
    const { viewport, canvas } = this.deps;
    const reduced = prefersReducedMotion(canvas);
    const start = viewport.toWorld(viewport.screenWidth / 2, viewport.screenHeight / 2);
    this.held = request.tokens.map((input, i) => {
      const ghost = new PlacementGhost(previews[i]!, start, input.rotation ?? 0, this.accent(), reduced);
      this.ghostLayer.addChild(ghost.root);
      return { input, home: { x: input.x, y: input.y }, size: input.size || 1, ghost, rotation: undefined };
    });
    const session = new PlacementSession({
      toWorld: (screen) => viewport.toWorld(screen.x, screen.y),
      zoom: () => viewport.scale.x,
      grid: () => placementGridOf(this.deps.grid(), this.deps.store.getState().grid?.snapToGrid ?? true),
      marks: this.marks,
      count: (at, count) => {
        this.queueCount.show(at, count);
        this.setTicking(true);
      },
      commit: (tokens) => request.commit(tokens),
      release: (ghosts) => this.release(ghosts),
      end: (placed) => {
        this.endSession(session);
        resolve(placed);
      },
    }, this.held, { x: viewport.screenWidth / 2, y: viewport.screenHeight / 2 });
    this.session = session;
    this.unbind = bindPlacementInput(this.deps, session);
    this.stopWatchingStore = this.deps.store.subscribe((state, previous) => {
      // Another tool, another map or a load ends the placement
      if (state.activeTool !== previous.activeTool || state.mapPath !== previous.mapPath || (state.isMapLoading && !previous.isMapLoading)) session.cancel();
    });
    this.setTicking(true);
  }

  private endSession(session: PlacementSession): void {
    if (this.session !== session) return;
    this.session = null;
    this.held = [];
    this.unbind?.();
    this.unbind = null;
    this.stopWatchingStore?.();
    this.stopWatchingStore = null;
  }

  /** The theme's accent, read once: the marks of a placement are drawn in it. */
  private accent(): number {
    return (this.accentColour ??= cssColorToHexNumber(getObsidianAccentColor()));
  }

  private release(ghosts: readonly PlacementGhost[]): void {
    for (const ghost of ghosts) this.leaving.add(ghost);
    const released = new Set(ghosts);
    this.held = this.held.filter(({ ghost }) => !released.has(ghost));
    this.setTicking(true);
  }

  private readonly tick = (ticker: Ticker): void => {
    const seconds = ticker.deltaMS / 1000;
    let moving = false;
    for (const { ghost } of this.held) moving = ghost.step(seconds) || moving;
    for (const ghost of this.leaving) {
      ghost.step(seconds);
      if (!ghost.finished) continue;
      this.leaving.delete(ghost);
      ghost.destroy();
    }
    moving = this.marks.step(seconds) || moving;
    moving = this.queueCount.step(seconds) || moving;
    if (!moving && !this.session && this.leaving.size === 0 && this.marks.idle) this.setTicking(false);
  };

  private setTicking(on: boolean): void {
    if (on === this.ticking) return;
    this.ticking = on;
    if (on) this.deps.app.ticker.add(this.tick);
    else this.deps.app.ticker.remove(this.tick);
  }
}
