import { CursorOverlay, CursorTap, MarkOverlay, PointerTap, type MeasureRules, type OverlayHost, type RemoteDrag } from '../marks/index.ts';
import { LIVE_INTERVAL_MS, type SharedCursor, type SharedStroke } from '../protocol/index.ts';
import type { Viewport } from 'pixi-viewport';
import { placeUnderTokens } from '../../pixi/measure/MeasureLayer';
import type { HeldPlayout } from '../../pixi/token-renderer/TokenPlaces';
import type { App } from 'obsidian';
import { FogCoverageCache } from '../../fog/FogCoverageCache';
import type { ViewState } from '../../types/viewState';
import { tokenFootprints, type TokenFootprint } from '../../vision/measureOrigin';
import { atlasLaserLook } from './atlasLighting.ts';
import type { SceneState, SceneStore } from './atlasView.ts';
import type { MapCanvas, MapMeasure, MapTokens } from './mapView.ts';
import type { GmMarkSource, PlayerMarks } from './MarkShare.ts';
import { levelObjects } from '../../levels/levelObjects';
import { levelMapKey } from '../../levels/sceneLevels';
import { mapTokens } from '../../tokens/offMap';

/** The parts of an Atlas tab's canvas the GM's marks are read from, or null while it has no viewport. */
function canvasParts(canvas: MapCanvas): { readonly viewport: Viewport; readonly canvas: HTMLCanvasElement; readonly tokens: MapTokens | null; readonly measure: MapMeasure | null } | null {
  const viewport = canvas.getViewportInstance();
  if (viewport === null) return null;
  return { viewport, canvas: canvas.getCanvasElement(), tokens: canvas.getTokenRenderer(), measure: canvas.getMeasureRenderer() };
}

/**
 * The GM's marks on a shared Atlas tab, read from its renderer: the measure renderer's records, a
 * `PointerTap` on its viewport for Atlas's laser (whose state is private), and what the players see of
 * the tokens (`playerRollTokens`, the token list's own source). Built anew when the tab builds its
 * renderer anew. Also draws the players' marks and the rulers of their drags over the tab (`MarkOverlay`; the bodies of the
 * areas they measure in the tab's own map, under its tokens and lighting) and their cursors
 * (`CursorOverlay`), and follows the GM's own cursor (`CursorTap`). A token a player drags is drawn as far
 * behind as that player's cursor, so the two move as one (`HeldPlayout`).
 */
export class GmMarks {
  private readonly app: App;
  /** The shared tab's canvas, or null once it is gone. */
  private readonly renderer: () => MapCanvas | null;
  private readonly store: SceneStore;
  /** The player whose drag holds a token, by GM token id. */
  private readonly draggerOf: (tokenId: string) => string | undefined;
  private readonly overlay: MarkOverlay;
  private readonly cursors = new CursorOverlay((cursor) => cursor.name ?? '');
  /** The committed fog a drawing under way is judged by. */
  private readonly fog = new FogCoverageCache();
  /** What the overlay shows: the players' marks and the rulers of their drags, each kept until it changes. */
  private shown: { players: PlayerMarks; drags: readonly RemoteDrag[]; strokes: readonly SharedStroke[] } = { players: { lasers: [], measures: [] }, drags: [], strokes: [] };
  private built: { readonly renderer: MapCanvas; readonly source: GmMarkSource; readonly taps: readonly { destroy(): void }[]; readonly host: OverlayHost; readonly tokens: MapTokens | null } | null = null;
  private readonly playout: HeldPlayout = {
    interval: LIVE_INTERVAL_MS,
    lag: (tokenId) => {
      const player = this.draggerOf(tokenId);
      return player === undefined ? null : this.cursors.lagOf(player);
    },
  };

  constructor(app: App, renderer: () => MapCanvas | null, store: SceneStore, rules: () => MeasureRules | null, draggerOf: (tokenId: string) => string | undefined) {
    this.app = app;
    this.renderer = renderer;
    this.store = store;
    this.draggerOf = draggerOf;
    this.overlay = new MarkOverlay(rules);
  }

  /** The GM's marks, the same object while the tab's renderer is the same; null while it has none. */
  source(): GmMarkSource | null {
    const renderer = this.renderer();
    const built = this.built;
    if (built !== null && built.renderer === renderer) return built.source;
    this.release();
    if (renderer === null) return null;
    const parts = canvasParts(renderer);
    if (parts === null) return null;
    const state = (): SceneState & Partial<Pick<ViewState, 'activeTool' | 'tokenSettings'>> => this.store.getState();
    const tap = new PointerTap(parts.viewport, parts.canvas, () => state().activeTool === 'laser-pointer');
    const cursor = new CursorTap(parts.viewport, parts.canvas);
    const stroke = renderer.getAnnotations()?.underWay;
    const source: GmMarkSource = {
      measurements: parts.measure?.measurements ?? null,
      laser: tap,
      cursor,
      ...(stroke !== undefined && { stroke }),
      fog: () => {
        const scene = state();
        return this.fog.get(levelObjects(scene).fog, levelMapKey(scene.mapPath, scene));
      },
      laserLook: () => atlasLaserLook(this.app),
      footprints: () => this.footprints(parts.tokens, state()),
      seen: () => {
        const mapPath = state().mapPath;
        const shown = mapPath === null ? null : this.renderer()?.playerRollTokens(mapPath);
        return (id) => shown?.has(id) === true;
      },
      onPlayersViewChange: (listener) => renderer.getCanvasAudience().onChange(listener),
    };
    parts.tokens?.setHeldPlayout(this.playout);
    // The bodies of the areas players measure lie in the map itself, where Atlas's own lie: under its tokens and its lighting.
    const host: OverlayHost = { canvas: parts.canvas, viewport: parts.viewport, layBodies: (layer) => placeUnderTokens(parts.viewport, layer), playerFrame: (layer) => renderer.addPlayerFrameLayer(layer) };
    this.built = { renderer, source, taps: [tap, cursor], host, tokens: parts.tokens };
    return source;
  }

  /** Draws the players' marks over the tab's map. */
  showPlayers(marks: PlayerMarks): void {
    this.shown.players = marks;
    this.showOverlay();
  }

  /** Draws the rulers of the players' drags over the tab's map. */
  showPlayerDrags(drags: readonly RemoteDrag[]): void {
    this.shown.drags = drags;
    this.showOverlay();
  }

  /** Draws the drawings players are making over the tab's map, each as it was last told. */
  showPlayerStrokes(strokes: readonly SharedStroke[]): void {
    this.shown.strokes = strokes;
    this.showOverlay();
  }

  /** Draws the players' cursors over the tab's map. */
  showPlayerCursors(cursors: readonly SharedCursor[]): void {
    this.source();
    if (this.built !== null) this.cursors.show(cursors, this.built.host);
    else this.cursors.clear();
  }

  dispose(): void {
    this.release();
    this.overlay.dispose();
    this.cursors.dispose();
  }

  /** Lets go of the renderer's parts: its taps, and its tokens go back to gliding. */
  private release(): void {
    this.built?.taps.forEach((tap) => tap.destroy());
    this.built?.tokens?.setHeldPlayout(null);
    this.built = null;
  }

  private showOverlay(): void {
    this.source();
    if (this.built !== null) this.overlay.show({ ...this.shown.players, drags: this.shown.drags, strokes: this.shown.strokes }, this.built.host);
  }

  /** Where every token stands, hidden ones included, as Atlas's measurements judge their start. */
  private footprints(tokens: MapTokens | null, state: SceneState & Partial<Pick<ViewState, 'tokenSettings'>>): TokenFootprint[] {
    const displayed = tokens?.getTokenSprites() ?? {};
    const size = this.renderer()?.getGridOptions()?.size ?? state.grid?.size ?? 0;
    return tokenFootprints(mapTokens(levelObjects(state)), displayed, size, state.tokenSettings?.tokenRingSize ?? 1);
  }
}
