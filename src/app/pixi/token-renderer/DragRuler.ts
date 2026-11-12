/**
 * Token drag ruler: while a token is dragged, measures the path from where it
 * started to the cell it would land in and labels the distance at the path's middle.
 * Space adds a waypoint at the current landing cell; the distance adds up
 * across waypoints, and difficult terrain on the way costs what the rules say
 * (`movementCostInCells`). The token still drops where the pointer is released.
 * Whether a drag shows its distance at all is the GM's choice (`shown`, read at every step, so a
 * change of the setting or a fight starting is followed at once).
 * Where the collection names movement steps and the token has a speed (`movement`), the line
 * takes the colour of the step the move lies in and the label sets the distance against the
 * speed; the drop counts what each token moved in the running turn (`countDrop`).
 * That reading is the GM's, and the players' for their own tokens (`sideOf`): of any other token
 * it would tell them a creature's speed and what it moved this turn, so their picture (a frame,
 * and the canvas while it shows their view, `playersView`) has the plain distance in the accent
 * in its place (`DragRulerView.playersLayers`).
 */

import type { StoreApi } from 'zustand';
import type { GridSystem } from '../../grid/GridSystem';
import type { GridGeometry } from '../../grid/gridDistance';
import { movementCostInCells } from '../../grid/movementCost';
import { tokenCenterShift } from '../../grid/gridPlacement';
import type { Point } from '../../grid/hexGeometry';
import { formatDistance, type MeasurementSettings } from '../../grid/measurementFormat';
import { movedThisTurn } from '../../initiative/movedThisTurn';
import { sideOf } from '../../initiative/sides';
import { dragMove, movedGameUnits, type DragMove } from '../../measure/dragMovement';
import type { ViewAtlasState } from '../../storeFactory';
import type { LayerVisibility } from '../playerSafeFrame';
import type { DragRulerView } from './DragRulerView';
import { levelObjects } from '../../levels/levelObjects';
import { computeTokenPixelSize, tokenDiameterInCells } from './tokenSizing';
import { difficultCells } from '../../mapFeatures/featureIndex';
import { mapFeatureList } from '../../mapFeatures/mapFeatures';
import { mapTokens } from '../../tokens/offMap';
import type { TokenEntity } from '../../types';
import type { TokenMovement } from './tokenMovement';

/** What a drag ruler measures: the token and the points it runs through (its start, each waypoint, its landing). */
export interface DragRulerPath {
  readonly tokenId: string;
  readonly points: readonly Point[];
}

/** A token of the drag as it is dropped: where the drag took it from and where it lands. */
export interface TokenDrop {
  readonly id: string;
  readonly from: Point;
  readonly to: Point;
}

export class DragRuler {
  private tokenId: string | null = null;
  /** The snapped start followed by every waypoint. */
  private waypoints: Point[] = [];
  private landing: Point | null = null;
  /** Where the dragged token is drawn now: the line ends under its centre, wherever it snaps to. */
  private tip: Point | null = null;
  private keyWindow: Window | null = null;

  constructor(
    private readonly view: DragRulerView,
    private readonly gridSystem: GridSystem,
    private readonly store: Pick<StoreApi<ViewAtlasState>, 'getState'>,
    private readonly settingsProvider: () => MeasurementSettings,
    private readonly tokenVisible: (tokenId: string) => boolean = () => true,
    private readonly shown: () => boolean = () => true,
    private readonly movement: Pick<TokenMovement, 'rules' | 'speedOf'> | null = null,
    /** Whether the canvas shows the players' view (session view, the peek, the palette's player mode). */
    private readonly playersView: () => boolean = () => false,
  ) {}

  /** Starts measuring a drag of `tokenId`, which started at `origin`. */
  begin(tokenId: string, origin: Point): void {
    this.end();
    this.tokenId = tokenId;
    this.waypoints = [this.snap(origin)];
    this.keyWindow = activeWindow;
    this.keyWindow.addEventListener('keydown', this.onKeyDown, true);
  }

  /** Measures to the cell a token at `position` would snap to, and draws the line to `position` itself. */
  update(position: Point): void {
    if (!this.tokenId) return;
    this.landing = this.snap(position);
    this.tip = { x: position.x, y: position.y };
    this.redraw();
  }

  end(): void {
    this.keyWindow?.removeEventListener('keydown', this.onKeyDown, true);
    this.keyWindow = null;
    this.tokenId = null;
    this.waypoints = [];
    this.landing = null;
    this.tip = null;
    this.view.clear();
  }

  /** The path the ruler shows now, or null while it shows none (no drag, one that has not left its start, or distances switched off). */
  path(): DragRulerPath | null {
    const landing = this.landing;
    if (!this.tokenId || !landing || !this.shown() || this.waypoints.every(point => samePoint(point, landing))) return null;
    return { tokenId: this.tokenId, points: [...this.waypoints, landing] };
  }

  /**
   * Counts what each dropped token moved in the running turn, where the rules count movement per
   * turn: the measured path from the token's own start to the place it is dropped at (`to`, as
   * the drop snapped it), priced as the ruler prices it. Call it in the drag's history
   * transaction, so undoing the drop gives the distance back. Nothing outside a drag, and nothing
   * on a map that measures in range bands.
   */
  countDrop(drops: readonly TokenDrop[]): void {
    const start = this.waypoints[0];
    if (!this.tokenId || !start || !this.movement?.rules().countPerTurn) return;
    const grid = this.gridSystem.getOptions();
    const settings = this.settingsProvider();
    /** Tokens by the distance they moved: tokens of one size on plain ground share theirs, and one write counts them. */
    const moved = new Map<number, string[]>();
    for (const { id, from, to } of drops) {
      const size = this.tokenSize(id);
      const own = this.snap(from, size);
      // The token's own path: the measured corners, as far from its start as they are from the dragged token's.
      const corners = this.waypoints.map((point) => ({ x: point.x + own.x - start.x, y: point.y + own.y - start.y }));
      const distance = movedGameUnits(this.cost([...corners, to], grid, settings, size), settings);
      if (distance === null || !(distance > 0)) continue;
      const tokens = moved.get(distance);
      if (tokens) tokens.push(id);
      else moved.set(distance, [id]);
    }
    for (const [distance, tokenIds] of moved) this.store.getState().countTurnMove(tokenIds, distance);
  }

  /**
   * Players never see the ruler of a token hidden from them, or of one they do not see (`isSeen`,
   * with dynamic lighting). Of a token that is not theirs they see the plain distance, where the
   * GM reads it against the token's speed.
   */
  getPlayerViewLayers(isSeen: (tokenId: string) => boolean = () => true): LayerVisibility[] {
    const token = this.token();
    const own = this.view.layers;
    const theirs = this.view.playersLayers;
    const shown = !token || (!token.isHidden && isSeen(token.id));
    if (!shown) return [...own, ...theirs].map(layer => ({ layer, visible: false }));
    if (theirs.length === 0) return [];
    // Their reading stands where the ruler shows, whichever of the two the canvas has.
    const showing = [...own, ...theirs].some(layer => layer.visible);
    return [...own.map(layer => ({ layer, visible: false })), ...theirs.map(layer => ({ layer, visible: showing }))];
  }

  /** A held token can enter fog without ending its measured drag; and the canvas shows the reading of whoever looks at it. */
  refreshVisibility(): void {
    const landing = this.landing;
    if (!this.tokenId || !landing) return;
    const visible = this.shown() && this.tokenVisible(this.tokenId) && this.waypoints.some((point) => !samePoint(point, landing));
    const theirs = this.view.playersLayers;
    const forPlayers = theirs.length > 0 && this.playersView();
    for (const layer of this.view.layers) layer.visible = visible && !forPlayers;
    for (const layer of theirs) layer.visible = visible && forPlayers;
  }

  destroy(): void {
    this.end();
    this.view.destroy();
  }

  /** Captures Space before the map hotkeys, which would open the command palette mid-drag. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    const last = this.waypoints[this.waypoints.length - 1];
    if (event.repeat || !this.landing || !this.shown() || (last && samePoint(last, this.landing))) return;
    this.waypoints.push(this.landing);
    this.redraw();
  };

  private redraw(): void {
    const points = this.path()?.points;
    if (!points) {
      this.view.clear();
      return;
    }
    const grid = this.gridSystem.getOptions();
    const settings = this.settingsProvider();
    const cells = this.cost(points, grid, settings);
    const move = this.moveOf(cells, settings);
    const drawn = this.tip ? [...points.slice(0, -1), this.tip] : points;
    const tokenRadius = computeTokenPixelSize(grid.size, this.tokenSize()) / 2;
    const plain = formatDistance(cells, settings);
    // A drag that reads as a plain distance is drawn as it always was: in the accent, no colour named.
    if (!move) this.view.draw(drawn, plain, tokenRadius, grid.size);
    else if (this.isPlayersOwn()) this.view.draw(drawn, move.label, tokenRadius, grid.size, move.color);
    else this.view.draw(drawn, move.label, tokenRadius, grid.size, move.color, plain);
    this.refreshVisibility();
  }

  /** What a path costs a token `size` cells wide, in grid cells: its length by the diagonal rule, and difficult terrain as the rules price it. */
  private cost(points: readonly Point[], grid: GridGeometry, settings: MeasurementSettings, size = this.tokenSize()): number {
    const features = mapFeatureList(levelObjects(this.store.getState()).mapFeatures);
    const rules = { diagonalRule: settings.diagonalRule, difficultTerrain: settings.difficultTerrain, difficult: difficultCells(features) };
    return movementCostInCells(grid, this.cellPath(points, grid, size), rules, this.snapsToGrid() ? tokenDiameterInCells(size) : 1);
  }

  /** How the drag reads under the movement rules; null where it reads as a plain distance (`dragMove`). */
  private moveOf(cells: number, settings: MeasurementSettings): DragMove | null {
    const token = this.token();
    const rules = this.movement?.rules();
    if (!this.movement || !token || !rules || rules.steps.length === 0) return null;
    // With a fight running and movement counted per turn, the drag goes on from what the token moved in the turn.
    const earlier = rules.countPerTurn ? movedThisTurn(this.store.getState(), token.id) : 0;
    return dragMove({ cells, earlier, speed: this.movement.speedOf(token), rules, settings });
  }

  private snap(point: Point, size = this.tokenSize()): Point {
    if (!this.snapsToGrid()) return { x: point.x, y: point.y };
    return this.gridSystem.snapTokenCenter(point.x, point.y, size);
  }

  /**
   * The snapped path as the cells the token's footprint starts from. An even footprint snaps to where
   * cells meet, and on a hex grid that point lies in none of the three hexes around it: which one the
   * rounding picks differs from place to place, so the same drag measured a hex more or less.
   */
  private cellPath(points: readonly Point[], grid: GridGeometry, size: number): readonly Point[] {
    if (!this.snapsToGrid()) return points;
    const shift = tokenCenterShift(grid.type, grid.size, size);
    return points.map(point => ({ x: point.x - shift.x, y: point.y - shift.y }));
  }

  private snapsToGrid(): boolean {
    return this.store.getState().grid?.snapToGrid ?? true;
  }

  /** Whether the dragged token is one of the players' own: they may read its speed and what it moved. */
  private isPlayersOwn(): boolean {
    return sideOf(this.token()) === 'players';
  }

  /** The dragged token as the store holds it now. */
  private token(): TokenEntity | undefined {
    return this.tokenId ? mapTokens(levelObjects(this.store.getState()))[this.tokenId] : undefined;
  }

  private tokenSize(tokenId: string | null = this.tokenId): number {
    const size = tokenId ? mapTokens(levelObjects(this.store.getState()))[tokenId]?.size : undefined;
    return size || 1;
  }
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}
