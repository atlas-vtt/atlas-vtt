import { Container } from 'pixi.js';
import type { GridGeometry } from '../../grid/gridDistance';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { AreaOnMapMemo, type AreaMap, type AreaOnMap } from '../../measure/areaOnMap';
import { AuraOnMapMemo, type PlacedAura } from '../../measure/auraArea';
import type { MeasureEffect } from '../../measure/measureEffects';
import { auraLabelText } from '../../measure/measureLabelText';
import { tokensInArea, type AreaToken } from '../../measure/measureTokens';
import type { Measurement } from '../../measure/measureTypes';
import type { HeightAt } from '../../measure/tokenHeight';
import type { MeasureParts } from '../measurePartsVisibility';
import { computeTokenPixelSize } from '../token-renderer/tokenSizing';
import { destroyTree } from '../utils/destroyTree';
import { drawMeasurement, drawMeasureOutline, drawMeasurePoint, measureLabelTarget } from '../utils/measureDrawing';
import { MeasureInk, type MeasureInkLayer } from '../utils/measureInk';
import { MeasureLabel } from '../utils/measureLabel';
import type { LabelTarget } from '../utils/measureLabelLayout';
import { AreaBody, type BodyLook } from './AreaBody';
import { AreaTokenRings, type MarkedToken } from './AreaTokenRings';
import type { AreaEffects } from './effects/AreaEffects';
import { legDistances, measureDistance } from './measureDistances';

/** A leg's label beside the distance's: the same pill, smaller. */
const LEG_LABEL_SIZE = 0.8;
const NO_TOKENS: readonly string[] = [];

/** What every measurement is drawn by: the zoom it shows at, the map's grid and rules, and the theme's accent. */
export interface MeasureLook {
  readonly zoom: number;
  readonly grid: GridGeometry;
  readonly settings: MeasurementSettings;
  /** The colour of a measurement that names none. */
  readonly accent: number;
  /** How high the token at a point stands: a ruler counts the height between its two ends. Without it, none. */
  readonly heightAt?: HeightAt | null;
  /** What of the map shapes an area: its walls, its rules, and whether its cells are counted. */
  readonly map: AreaMap;
  /** The tokens of the level shown, read only for an area that marks the tokens in it. */
  readonly tokens: () => Readonly<Record<string, AreaToken>>;
  /** How much wider than its art a token is drawn with its ring (the scene's token ring size). */
  readonly ringScale: number;
}

/** Where a measurement's pieces are drawn. */
export interface MeasureSurfaces {
  /** Under the tokens and the lighting: the bodies of areas. */
  readonly bodies: Container;
  /** What plays the effects of the bodies; without it every body keeps its wash. */
  readonly effects?: AreaEffects;
  /** Above the lighting, for everyone: rulers, and the rings on the tokens in an area. */
  readonly shapes: MeasureInkLayer;
  /** Above the lighting, for the GM alone: the outline of every area, which must be read in a dark room too. */
  readonly outlines: MeasureInkLayer;
  readonly labels: Container;
}

interface Drawn {
  readonly measurement: Measurement;
  readonly color: number | null;
  /** An area stops at walls. */
  readonly walls: boolean;
  /** Where an aura lies around its token now; null for every other measurement. */
  readonly aura: PlacedAura | null;
  /** The look its body is drawn with, and what tells its pattern from another's; null for the plain wash. */
  readonly look: BodyLook | null;
}

/** What an area's drawing is made from: drawn from the same again, it is the same drawing. */
interface Inked {
  readonly onMap: AreaOnMap;
  readonly tint: number;
  readonly zoom: number;
  readonly tokens: readonly string[];
  readonly text: string;
  readonly effect: MeasureEffect | null;
}

/**
 * One measurement on the map. A ruler: its line in ink, its distance, and for one with corners each
 * leg's length, small, at the leg's middle. An area: its body under the lighting (`AreaBody`), its
 * outline in ink for the GM, its size, and while it is `marked` (being drawn, or pointed at) a ring
 * on every token in it and their number on its label. An aura is the area around its token
 * (`PlacedAura`): it says how far it reaches above its top edge, has no dot where it starts, since
 * its token stands there, and never marks or counts that token. The labels are one part, shown and
 * hidden together.
 */
export class DrawnMeasure {
  readonly distance = new MeasureLabel();
  /** What shows or hides the measurement. The same object for its life. */
  readonly parts: MeasureParts;
  private readonly ink: MeasureInk;
  private readonly body: AreaBody;
  private readonly rings: AreaTokenRings;
  private readonly area = new AreaOnMapMemo();
  private readonly auraArea = new AuraOnMapMemo();
  private readonly labels = new Container({ label: 'measure-labels-of-one', eventMode: 'none', interactiveChildren: false });
  private readonly legs: MeasureLabel[] = [];
  /** The distance with the number of tokens the players see, in the GM's label's place in their picture. */
  private playersLabel: MeasureLabel | null = null;
  private playersCount: number | null = null;
  private drawn: Drawn | null = null;
  /** The area as it is drawn now; null for a ruler and while nothing is drawn. */
  private inked: Inked | null = null;
  private look: MeasureLook | null = null;
  /** The tokens in the area as last counted, and what they were counted from. */
  private counted: { readonly onMap: AreaOnMap; readonly record: object; readonly ids: readonly string[] } | null = null;

  /** `marked`: an area drawn here marks the tokens in it from the start. */
  constructor(private readonly surfaces: MeasureSurfaces, private marked = false) {
    this.ink = new MeasureInk(surfaces.shapes);
    this.body = new AreaBody(surfaces.bodies, surfaces.effects);
    this.rings = new AreaTokenRings(surfaces.shapes);
    this.labels.addChild(this.distance.view);
    surfaces.labels.addChild(this.labels);
    const { ink, body, rings, distance } = this;
    const shown = (): MeasureLabel | null => this.playersLabel;
    this.parts = {
      shape: {
        get visible(): boolean { return ink.shape.visible; },
        set visible(visible: boolean) {
          ink.shape.visible = visible;
          body.view.visible = visible;
        },
      },
      label: this.labels,
      marks: {
        get rings() { return rings.rings; },
        gmCount: distance.view,
        get playersCount() { return shown()?.view ?? null; },
        countForPlayers: (count) => this.countForPlayers(count),
      },
    };
  }

  /** The container of its labels, for what stands with them (the pin). */
  get labelLayer(): Container {
    return this.labels;
  }

  /**
   * Draws `measurement` in `color` (null: the accent); an area stops at walls unless `walls` is
   * false, an aura lies where `aura` places it, and a body takes the look `effect` names. An area
   * that comes out the same as the one drawn (a circle dragged around at one size, an aura whose
   * token stands on the same cells) is left as it is.
   */
  draw(measurement: Measurement, color: number | null, look: MeasureLook, walls = true, aura: PlacedAura | null = null, effect: BodyLook | null = null): void {
    this.drawn = { measurement, color, walls, aura, look: effect };
    this.redraw(look, false);
  }

  /**
   * Draws it again as it is: the zoom, the theme, the grid, the rules, the walls or the tokens
   * changed. `anew` unless the caller knows that only the measurement may be another.
   */
  redraw(look: MeasureLook, anew = true): void {
    const drawn = this.drawn;
    if (!drawn) return;
    this.look = look;
    const { measurement, color } = drawn;
    const { zoom, grid, settings } = look;
    const tint = color ?? look.accent;
    const ruler = measurement.shape === 'ruler';
    const onMap = this.onMap(look);
    const tokens = onMap && this.marked ? this.tokensIn(onMap, look) : NO_TOKENS;
    const text = this.text(drawn, look, tokens.length, look.heightAt);
    const effect = drawn.look?.effect ?? null;
    const inked: Inked | null = onMap && { onMap, tint, zoom, tokens, text, effect };
    const before = this.inked;
    this.inked = inked;
    if (!anew && inked && before && before.onMap === onMap && before.tint === tint && before.zoom === zoom && before.tokens === tokens && before.text === text && before.effect === effect) return;
    // Its pattern holds on to where the area starts: an aura's to the middle of its shape, which goes with its token.
    const origin = drawn.aura?.shaped.origin ?? measurement.points[0];
    this.body.draw(onMap, tint, grid, drawn.look && origin ? { ...drawn.look, origin } : null);
    this.ink.onto(ruler ? this.surfaces.shapes : this.surfaces.outlines);
    this.ink.begin(zoom);
    if (ruler) {
      drawMeasurement(this.ink, tint, measurement, settings.coneAngle);
    } else {
      if (onMap) drawMeasureOutline(this.ink, tint, onMap.area.rings);
      const origin = measurement.points[0];
      if (origin && !drawn.aura) drawMeasurePoint(this.ink, tint, origin, true);
    }
    this.rings.show(ringed(tokens, look), tint, zoom);
    this.playersCount = null;
    this.distance.show(text, labelTarget(drawn), zoom, grid.size);
    const legs = ruler ? legDistances(grid, measurement.points, settings) : [];
    this.fitLegs(legs.length);
    legs.forEach(({ from, to, distance }, index) => this.legs[index]!.show(distance, { beside: [from, to] }, zoom, grid.size));
  }

  /**
   * Marks the tokens in the area, or stops: while it is drawn or pointed at they are ringed and
   * counted. True when that changed what is drawn.
   */
  setMarked(marked: boolean, look: MeasureLook): boolean {
    if (marked === this.marked) return false;
    this.marked = marked;
    return this.redrawArea(look);
  }

  /** The tokens of the map are others, or stand elsewhere: an area that marks its tokens counts them again. True when it did. */
  tokensChanged(look: MeasureLook): boolean {
    return this.marked && this.redrawArea(look);
  }

  /** Draws an area again, by other walls; a ruler has none to stop at. True when it is an area. */
  redrawArea(look: MeasureLook): boolean {
    if (!this.drawn || this.drawn.measurement.shape === 'ruler') return false;
    this.redraw(look);
    return true;
  }

  /** The ids of the tokens in the area as it lies on the map now, marked or not; none for a ruler. */
  tokens(look: MeasureLook): readonly string[] {
    const onMap = this.onMap(look);
    return onMap ? this.tokensIn(onMap, look) : NO_TOKENS;
  }

  /** Takes the drawing away; the labels are hidden by whoever shows and hides the parts. */
  clear(): void {
    this.drawn = null;
    this.inked = null;
    this.counted = null;
    this.area.forget();
    this.auraArea.forget();
    this.ink.clear();
    this.body.clear();
    this.rings.clear();
    this.fitLegs(0);
  }

  destroy(): void {
    this.rings.destroy();
    this.ink.destroy();
    this.body.destroy();
    destroyTree(this.labels);
  }

  private onMap(look: MeasureLook): AreaOnMap | null {
    const drawn = this.drawn;
    if (!drawn || drawn.measurement.shape === 'ruler') return null;
    return drawn.aura ? this.auraArea.get(drawn.aura, look.map, drawn.walls) : this.area.get(drawn.measurement, look.map, drawn.walls);
  }

  /** What its label says: with `tokens` in an area, and a ruler with the height between the tokens under its ends. */
  private text({ measurement, aura }: Drawn, look: MeasureLook, tokens: number, heightAt?: HeightAt | null): string {
    return aura ? auraLabelText(aura.cells, look.settings, tokens) : measureDistance(look.grid, measurement, look.settings, heightAt, tokens);
  }

  /** Counted again only for another area or other tokens. */
  private tokensIn(onMap: AreaOnMap, look: MeasureLook): readonly string[] {
    const record = look.tokens();
    const counted = this.counted;
    if (counted && counted.onMap === onMap && counted.record === record) return counted.ids;
    const bearer = this.drawn?.aura?.measure.follows;
    const ids = tokensInArea(Object.values(record), onMap.area, look.map.cells ? look.map.grid : null, onMap.cells).filter((id) => id !== bearer);
    this.counted = { onMap, record, ids };
    return ids;
  }

  /** Writes the players' label, where the GM's stands: the size with the `count` tokens the players see. */
  private countForPlayers(count: number): void {
    const { drawn, look } = this;
    if (!drawn || !look || count === this.playersCount) return;
    this.playersCount = count;
    if (!this.playersLabel) {
      this.playersLabel = new MeasureLabel();
      this.playersLabel.view.visible = false;
      this.labels.addChildAt(this.playersLabel.view, this.labels.getChildIndex(this.distance.view) + 1);
    }
    this.playersLabel.show(this.text(drawn, look, count), labelTarget(drawn), look.zoom, look.grid.size);
  }

  /** As many leg labels as legs to name. */
  private fitLegs(count: number): void {
    while (this.legs.length > count) this.legs.pop()?.destroy();
    while (this.legs.length < count) {
      const label = new MeasureLabel(LEG_LABEL_SIZE);
      this.labels.addChild(label.view);
      this.legs.push(label);
    }
  }
}

/** Where its distance goes: above an aura's top edge, since its token stands in its middle. */
function labelTarget({ measurement, aura }: Drawn): LabelTarget {
  return aura ? { beside: [aura.top] } : measureLabelTarget(measurement);
}

/** The tokens to ring, each with the circle its ring is drawn around. */
function ringed(ids: readonly string[], look: MeasureLook): MarkedToken[] {
  if (ids.length === 0) return [];
  const record = look.tokens();
  return ids.flatMap((id) => {
    const token = record[id];
    if (!token) return [];
    const radius = (computeTokenPixelSize(look.grid.size, token.size || 1) / 2) * Math.max(1, look.ringScale);
    return [{ id, x: token.x, y: token.y, radius }];
  });
}
