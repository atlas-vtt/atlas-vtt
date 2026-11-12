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

/** The ring on one token in an area. */
export interface TokenRingPart {
  readonly tokenId: string;
  readonly layer: HideableLayer;
}

/**
 * What marks the tokens in an area while it is drawn or pointed at: a ring on each, and their
 * number on its label. One object for the measurement's life, without rings while it marks none.
 */
export interface TokenMarkParts {
  readonly rings: readonly TokenRingPart[];
  /** The distance as the GM reads it, with the number of tokens in the area. */
  readonly gmCount: HideableLayer;
  /** The label that stands in its place in the players' picture; null until one was written. */
  readonly playersCount: HideableLayer | null;
  /** Writes the players' label: the area holds `count` tokens the players see. */
  countForPlayers(count: number): void;
}

/**
 * A drawn measurement: its shape (a ruler's line; an area's body, which lies under the lighting),
 * its distance labels, and what marks the tokens in an area.
 */
export interface MeasureParts {
  readonly shape: HideableLayer;
  readonly label: HideableLayer;
  readonly marks: TokenMarkParts;
}

/** The live measurement's parts: with the pin beside its label, which keeps it while it fades. */
export interface LiveMeasureParts extends MeasureParts {
  /** A part of `label`, so it hides with it. */
  readonly pin: HideableLayer;
}

/** Who looks at the measurements: the players by what they see, or the GM (`seen` null), on the canvas or in a picture of the scene. */
interface Viewer {
  readonly seen: TokenSeen | null;
  /** A picture of the scene: the GM's view without what the GM only points with. */
  readonly picture?: boolean;
}

/**
 * Which parts of the measurements show, the one place that sets their `visible`. The GM's view shows
 * what is drawn; the players' picture (their frame, and the canvas while it shows their view) leaves a
 * measurement out while `playersSeeMeasure` says so: one the GM measures for themselves, and one
 * whose start lies on tokens the players do not see. An area's body follows the same rule, and the
 * lighting above it decides where players see it. Of the tokens an area marks while it is made, the
 * players' picture rings and counts only those the players see; the marks of a kept area the GM
 * points at are the GM's own look, and the players' picture has none of them. The pin, the kept measurements' handles and the unlit
 * outlines that let the GM read an area in the dark (`gmLayers`) are the GM's own: the pin is never
 * in a frame, and the others show on the GM's view of the canvas alone, never in a frame or a
 * picture of the scene.
 */
export class MeasurePartsVisibility {
  /** Whether the live label is drawn: set with every drawing, cleared with the measurement. It starts shown, empty. */
  private label = true;
  /** Who sees the live measurement; null while there is none. */
  private liveAudience: MeasureAudience | null = null;
  private readonly kept = new Map<MeasureParts, MeasureAudience>();

  /** `gmLayers` are the layers only the GM's view of the canvas shows: the handles of the kept measurements, the areas' unlit outlines, and the range check with the rings of Ranges. */
  constructor(private readonly live: LiveMeasureParts, private readonly view: () => MeasurePlayersView | null, private readonly gmLayers: readonly HideableLayer[]) {
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
    setLayerVisibility(this.liveLayers(this.onCanvas()));
  }

  /** The live measurement was drawn. */
  drawn(): void {
    this.label = true;
    const viewer = this.onCanvas();
    this.showGmLayers(viewer);
    setLayerVisibility(this.liveLayers(viewer));
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
    setLayerVisibility(this.liveLayers({ seen: null }));
  }

  /** A kept measurement is drawn in `parts`, or changed: `audience` says who sees it. */
  keep(parts: MeasureParts, audience: MeasureAudience): void {
    this.kept.set(parts, audience);
    const viewer = this.onCanvas();
    this.showGmLayers(viewer);
    setLayerVisibility(this.keptLayers(parts, audience, viewer));
  }

  /** A kept measurement's drawing is gone. */
  forget(parts: MeasureParts): void {
    this.kept.delete(parts);
  }

  /** The tokens the measurement in `parts` marks are others: their rings and their number show as the canvas should show them. */
  marked(parts: MeasureParts): void {
    const live = parts === this.live;
    const audience = live ? this.liveAudience : this.kept.get(parts);
    setLayerVisibility(markLayers(parts.marks, audience ?? null, this.onCanvas(), live));
  }

  /** Shows on the canvas what it should show now: the players' sight, or whether the canvas shows it, changed. */
  refresh(): void {
    const viewer = this.onCanvas();
    // The GM's own layers hold marks that are no measurement's (the range check, the rings of Ranges): they follow the canvas whatever is measured.
    this.showGmLayers(viewer);
    if (!this.liveAudience && this.kept.size === 0) return;
    setLayerVisibility(this.layers(viewer));
  }

  /** Every part as a players' frame shows it, by what they see (`seen`). */
  playerViewLayers(seen: TokenSeen): LayerVisibility[] {
    const layers = this.layers({ seen });
    if (this.live.pin.visible) layers.push({ layer: this.live.pin, visible: false });
    return [...layers, ...this.gmLayers.map((layer) => ({ layer, visible: false }))];
  }

  /** Every part as the GM view shows it, for a picture of the scene: the measurements, without what the GM points and moves them with. */
  gmViewLayers(): LayerVisibility[] {
    return [...this.layers({ seen: null, picture: true }), ...this.gmLayers.map((layer) => ({ layer, visible: false }))];
  }

  /** The GM's own layers show on the GM's view of the canvas alone (`seen` is null there). */
  private showGmLayers({ seen }: Viewer): void {
    const shown = seen === null;
    for (const layer of this.gmLayers) {
      if (layer.visible !== shown) layer.visible = shown;
    }
  }

  private onCanvas(): Viewer {
    return { seen: this.view()?.seenOnCanvas() ?? null };
  }

  private layers(viewer: Viewer): LayerVisibility[] {
    const kept = [...this.kept];
    return [
      ...this.liveLayers(viewer, false),
      ...kept.flatMap(([parts, audience]) => this.keptLayers(parts, audience, viewer, false)),
      // After every shape and label, so those keep their places in the list whatever is marked.
      ...markLayers(this.live.marks, this.liveAudience, viewer, true),
      ...kept.flatMap(([parts, audience]) => markLayers(parts.marks, audience, viewer, false)),
    ];
  }

  private liveLayers(viewer: Viewer, marks = true): LayerVisibility[] {
    const shown = shownBy(this.liveAudience, viewer.seen);
    const { shape, label } = this.live;
    return [{ layer: shape, visible: shown }, { layer: label, visible: this.label && shown }, ...(marks ? markLayers(this.live.marks, this.liveAudience, viewer, true) : [])];
  }

  private keptLayers(parts: MeasureParts, audience: MeasureAudience, viewer: Viewer, marks = true): LayerVisibility[] {
    const visible = shownBy(audience, viewer.seen);
    return [{ layer: parts.shape, visible }, { layer: parts.label, visible }, ...(marks ? markLayers(parts.marks, audience, viewer, false) : [])];
  }
}

/** Without `seen` (the GM's view) or a measurement to ask about, a part shows. */
function shownBy(audience: MeasureAudience | null, seen: TokenSeen | null): boolean {
  return !seen || !audience || playersSeeMeasure(audience, seen);
}

/**
 * The marks on the tokens in an area as `viewer` sees them. The GM's canvas rings every token in
 * it and its label counts them all. The players' picture rings the tokens the players see, of a
 * measurement they see that is being made (`live`), and a label of its own counts those: neither
 * tells of a token they do not see. A kept area marks its tokens only while the GM points at it:
 * the players' picture then has no ring, and its label counts none. A picture of the scene has no
 * rings: they belong to what the GM points at.
 */
function markLayers(marks: TokenMarkParts, audience: MeasureAudience | null, { seen, picture }: Viewer, live: boolean): LayerVisibility[] {
  const shown = !picture && shownBy(audience, seen);
  const ringed = (tokenId: string): boolean => !seen || (live && seen(tokenId));
  const layers: LayerVisibility[] = marks.rings.map(({ tokenId, layer }) => ({ layer, visible: shown && ringed(tokenId) }));
  const forPlayers = seen !== null && marks.rings.length > 0;
  if (forPlayers) marks.countForPlayers(marks.rings.filter(({ tokenId }) => ringed(tokenId)).length);
  if (marks.playersCount) layers.push({ layer: marks.gmCount, visible: !forPlayers }, { layer: marks.playersCount, visible: forPlayers });
  return layers;
}
