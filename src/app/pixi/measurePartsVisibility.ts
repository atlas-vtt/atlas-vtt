import type { Point } from '../types/visionTypes';
import { measureOriginOf, playersSeeMeasure, type MeasureAudience, type MeasureOrigin, type TokenFootprint, type TokenSeen } from '../vision/measureOrigin';
import { setLayerVisibility, type HideableLayer, type LayerVisibility } from './playerSafeFrame';

/** What a measurement needs to know of the tokens to decide whether the players' picture shows it. */
export interface MeasurePlayersView {
  /** Where every token stands now, hidden ones included. */
  footprints(): TokenFootprint[];
  /** Whether the players see each token in their frame now, whatever the canvas shows. */
  seenAtStart(): TokenSeen;
  /** The same while the canvas shows the players' view; null in the GM view. */
  seenOnCanvas(): TokenSeen | null;
}

/** A drawn measurement: its shape and its distance labels. */
export interface MeasureParts {
  readonly shape: HideableLayer;
  readonly label: HideableLayer;
}

/** The live measurement's parts: with the pin beside its label, which keeps it while it fades. */
export interface LiveMeasureParts extends MeasureParts {
  /** A part of `label`, so it hides with it. */
  readonly pin: HideableLayer;
}

/**
 * Which parts of the measurements show, the one place that sets their `visible`. The GM's view shows
 * what is drawn; the players' picture (their frame, and the canvas while it shows their view) leaves a
 * measurement out while `playersSeeMeasure` says so: one the GM measures for themselves, and one
 * whose start lies on tokens the players do not see. The pin is the GM's control: never in a frame.
 */
export class MeasurePartsVisibility {
  /** Whether the live label is drawn: set with every drawing, cleared with the measurement. It starts shown, empty. */
  private label = true;
  /** Who sees the live measurement; null while there is none. */
  private liveAudience: MeasureAudience | null = null;
  private readonly kept = new Map<MeasureParts, MeasureAudience>();

  constructor(private readonly live: LiveMeasureParts, private readonly view: () => MeasurePlayersView | null) {
    live.pin.visible = false;
  }

  /** Whether the live measurement's label is drawn, whether or not the canvas shows it now. */
  get labelDrawn(): boolean {
    return this.label;
  }

  /** The tokens the live measurement started on; null while there is none, or no players' view to ask. */
  get liveOrigin(): MeasureOrigin | null {
    return this.liveAudience?.origin ?? null;
  }

  /**
   * The live measurement starts at `points` (where the pointer pressed, and where its start is
   * drawn); `hidden` while the GM measures for themselves.
   */
  start(points: readonly Point[], hidden: boolean): void {
    const view = this.view();
    this.liveAudience = { hidden, origin: view ? measureOriginOf(points, view.footprints(), view.seenAtStart()) : null };
  }

  /** The GM switched whether players see what is measured, with a measurement on the map. */
  setLiveHidden(hidden: boolean): void {
    if (!this.liveAudience || this.liveAudience.hidden === hidden) return;
    this.liveAudience = { ...this.liveAudience, hidden };
    setLayerVisibility(this.liveLayers(this.seenOnCanvas()));
  }

  /** The live measurement was drawn. */
  drawn(): void {
    this.label = true;
    setLayerVisibility(this.liveLayers(this.seenOnCanvas()));
  }

  /** The live measurement was released and fades (`shown`), or stopped fading. */
  pinned(shown: boolean): void {
    if (this.live.pin.visible !== shown) this.live.pin.visible = shown;
  }

  /** The live measurement was cleared. */
  cleared(): void {
    this.label = false;
    this.liveAudience = null;
    this.pinned(false);
    setLayerVisibility(this.liveLayers(null));
  }

  /** A kept measurement is drawn in `parts`, or changed: `audience` says who sees it. */
  keep(parts: MeasureParts, audience: MeasureAudience): void {
    this.kept.set(parts, audience);
    setLayerVisibility(this.keptLayers(parts, audience, this.seenOnCanvas()));
  }

  /** A kept measurement's drawing is gone. */
  forget(parts: MeasureParts): void {
    this.kept.delete(parts);
  }

  /** Shows on the canvas what it should show now: the players' sight, or whether the canvas shows it, changed. */
  refresh(): void {
    if (!this.liveAudience && this.kept.size === 0) return;
    setLayerVisibility(this.layers(this.seenOnCanvas()));
  }

  /** Every part as a players' frame shows it, by what they see (`seen`). */
  playerViewLayers(seen: TokenSeen): LayerVisibility[] {
    const layers = this.layers(seen);
    if (this.live.pin.visible) layers.push({ layer: this.live.pin, visible: false });
    return layers;
  }

  /** Every part as the GM view shows it, for a picture of the scene. */
  gmViewLayers(): LayerVisibility[] {
    return this.layers(null);
  }

  private seenOnCanvas(): TokenSeen | null {
    return this.view()?.seenOnCanvas() ?? null;
  }

  private layers(seen: TokenSeen | null): LayerVisibility[] {
    return [...this.liveLayers(seen), ...[...this.kept].flatMap(([parts, audience]) => this.keptLayers(parts, audience, seen))];
  }

  private liveLayers(seen: TokenSeen | null): LayerVisibility[] {
    const shown = shownBy(this.liveAudience, seen);
    const { shape, label } = this.live;
    return [{ layer: shape, visible: shown }, { layer: label, visible: this.label && shown }];
  }

  private keptLayers({ shape, label }: MeasureParts, audience: MeasureAudience, seen: TokenSeen | null): LayerVisibility[] {
    const visible = shownBy(audience, seen);
    return [{ layer: shape, visible }, { layer: label, visible }];
  }
}

/** Without `seen` (the GM's view) or a measurement to ask about, a part shows. */
function shownBy(audience: MeasureAudience | null, seen: TokenSeen | null): boolean {
  return !seen || !audience || playersSeeMeasure(audience, seen);
}
