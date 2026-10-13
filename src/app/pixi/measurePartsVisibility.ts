import type { Point } from '../types/visionTypes';
import { measureOriginOf, measureShownToPlayers, type MeasureOrigin, type TokenFootprint, type TokenSeen } from '../vision/measureOrigin';
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

/** A drawn measurement: its shape, its label's pill and its label. */
export interface MeasureParts {
  readonly graphics: HideableLayer;
  readonly pill: HideableLayer;
  readonly text: HideableLayer;
}

/**
 * Which parts of the measurements show, the one place that sets their `visible`. The GM's view shows
 * what is drawn; the players' picture (their frame, and the canvas while it shows their view) leaves a
 * measurement out while `measureShownToPlayers` says so for the tokens under its start.
 */
export class MeasurePartsVisibility {
  /** Whether the live label is drawn: set with every drawing, cleared with the measurement. It starts shown, empty. */
  private label = true;
  private liveOrigin: MeasureOrigin | null = null;
  private readonly kept = new Map<MeasureParts, MeasureOrigin | null>();

  constructor(private readonly live: MeasureParts, private readonly view: () => MeasurePlayersView | null) {}

  /** Whether the live measurement's label is drawn, whether or not the canvas shows it now. */
  get labelDrawn(): boolean {
    return this.label;
  }

  /** The live measurement starts at `points` (where the pointer pressed, and where its start is drawn). */
  start(points: readonly Point[]): void {
    const view = this.view();
    this.liveOrigin = view ? measureOriginOf(points, view.footprints(), view.seenAtStart()) : null;
  }

  /** The live measurement was drawn. */
  drawn(): void {
    this.label = true;
    setLayerVisibility(this.liveLayers(this.seenOnCanvas()));
  }

  /** The live measurement was cleared. */
  cleared(): void {
    this.label = false;
    this.liveOrigin = null;
    setLayerVisibility(this.liveLayers(null));
  }

  /** The live measurement was copied into `parts`, which keep its origin. */
  keep(parts: MeasureParts): void {
    this.kept.set(parts, this.liveOrigin);
    setLayerVisibility(this.keptLayers(parts, this.liveOrigin, this.seenOnCanvas()));
  }

  /** Every kept measurement was removed. */
  forgetKept(): void {
    this.kept.clear();
  }

  /** Shows on the canvas what it should show now: the players' sight, or whether the canvas shows it, changed. */
  refresh(): void {
    if (!this.liveOrigin && this.kept.size === 0) return;
    setLayerVisibility(this.layers(this.seenOnCanvas()));
  }

  /** Every part as a players' frame shows it, by what they see (`seen`). */
  playerViewLayers(seen: TokenSeen): LayerVisibility[] {
    return this.layers(seen);
  }

  /** Every part as the GM view shows it, for a picture of the scene. */
  gmViewLayers(): LayerVisibility[] {
    return this.layers(null);
  }

  private seenOnCanvas(): TokenSeen | null {
    return this.view()?.seenOnCanvas() ?? null;
  }

  private layers(seen: TokenSeen | null): LayerVisibility[] {
    return [...this.liveLayers(seen), ...[...this.kept].flatMap(([parts, origin]) => this.keptLayers(parts, origin, seen))];
  }

  private liveLayers(seen: TokenSeen | null): LayerVisibility[] {
    const shown = shownBy(this.liveOrigin, seen);
    const { graphics, pill, text } = this.live;
    return [{ layer: graphics, visible: shown }, { layer: pill, visible: this.label && shown }, { layer: text, visible: this.label && shown }];
  }

  private keptLayers({ graphics, pill, text }: MeasureParts, origin: MeasureOrigin | null, seen: TokenSeen | null): LayerVisibility[] {
    const visible = shownBy(origin, seen);
    return [{ layer: graphics, visible }, { layer: pill, visible }, { layer: text, visible }];
  }
}

/** Without `seen` (the GM's view) or an origin (no players' view to ask), a measurement shows. */
function shownBy(origin: MeasureOrigin | null, seen: TokenSeen | null): boolean {
  return !seen || !origin || measureShownToPlayers(origin, seen);
}
