import type { MeasureState } from '../protocol/index.ts';
import type { Container } from 'pixi.js';
import type { GridGeometry } from '../../grid/gridDistance';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { DifficultCells } from '../../grid/movementCost';
import type { AreaMap } from '../../measure/areaOnMap';
import type { AuraToken } from '../../measure/auraArea';
import type { AreaEffects } from '../../pixi/measure/effects/AreaEffects';

/** One sender's measurements as they arrive. */
export type RemoteMeasure = { readonly who: string } & MeasureState;

/** What a measurement is measured by: the scene's grid and how its distances read. */
export interface MeasureRules {
  readonly grid: GridGeometry;
  readonly measurement: MeasurementSettings;
  /** Where the scene's difficult terrain lies, which drags pay for by the measurement's rule; null or unset where it has none. */
  readonly difficult?: DifficultCells | null;
  /**
   * What of the map shapes an area measured on it (`areaMapOf`): whether its cells are counted, and
   * the walls areas stop at. Unset, cells are counted and no wall stops an area: it is drawn whole.
   */
  readonly areas?: AreaMap | null;
}

/** Puts a layer into a map, where it lies under the map's tokens and its lighting. */
export type LayBodies = (layer: Container) => void;

export interface RemoteMeasurePorts {
  /** The zoom the map shows at: lines and labels keep their size on screen. */
  zoom(): number;
  /** What the measurements are measured and shaped by; null while that is not known, and nothing is drawn. */
  rules(): MeasureRules | null;
  /** The senders' nominal send interval, in ms. */
  readonly interval: number;
  /**
   * Draws the outline of every area above the lighting too, with the dot where it starts: for a GM,
   * who must read an area in a dark room. Never where players look: the outline of an area cut by
   * walls draws the rooms it is cut by.
   */
  readonly gmOutlines?: boolean;
  /**
   * Plays the looks of the areas' bodies (fire, frost, …) on the host's own clock: the host makes
   * it for its map (`AreaEffects` over its playback), tells it how the map plays (`setMode`) and
   * destroys it after these measurements. Without it, and where it cannot draw, an area with a
   * look keeps its plain body.
   */
  readonly effects?: AreaEffects;
  /**
   * Where the token a sender names (`ToldMeasure.aura.token`) is drawn now, and its size in cells;
   * null while the host draws no such token. An aura lies around it, and is not drawn without it.
   * The host says when tokens moved (`tokensMoved`). Without it no aura is drawn.
   */
  token?(id: string): AuraToken | null;
}
