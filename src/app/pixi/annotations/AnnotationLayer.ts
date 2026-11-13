import { Container, Graphics, type Sprite } from 'pixi.js';
import type { TextMeasure } from '../../annotations/annotationBounds';
import { annotationIndex } from '../../annotations/annotationHit';
import type { Annotation, DrawLayer } from '../../annotations/annotationTypes';
import { curveTolerance } from '../../annotations/drawingInk';
import type { Box } from '../../vision/polygonBounds';
import { createStampSprite, paintDrawing, placeStamp, StampTextures } from '../drawingLayer';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import { createTextElementView, measureTextView, textElementOf, updateTextElementView } from '../textElementView';
import { destroyTree } from '../utils/destroyTree';
import { LayerPreview } from './LayerPreview';

/** How pale the GM sees what only the GM sees. */
export const HIDDEN_ANNOTATION_ALPHA = 0.5;
/**
 * The points of the annotations first drawn in one go: PIXI builds the geometry of what is drawn
 * in the frame that follows, about a sixth of a millisecond for a stroke of a hundred points, so
 * a view that comes upon a thousand drawings at once draws them over some frames, not in one.
 */
export const BUILD_POINTS = 2000;
/** What a text or a stamp counts for among them. */
const NODE_POINTS = 50;

/** Keeps the texts of a map sharp at the pictures that show them (`TextSharpening`). */
export interface TextSharpness {
  track(id: string, view: Container): void;
  forget(id: string): void;
}

export interface AnnotationLayerOptions {
  /** Screen pixels to a world pixel now: a drawing's curve is rounded for the zoom it is first drawn at. */
  zoom(): number;
  /** Without it a text is drawn at the renderer's own resolution. */
  readonly sharpness?: TextSharpness;
  /** The picture changed in a way nothing else tells of: a stamp's symbol came in. */
  readonly changed?: () => void;
}

type NodeKind = 'text' | 'stamp' | 'ink';

interface Entry {
  annotation: Annotation;
  /** Its place in the list: a later one lies over an earlier one. */
  index: number;
  /** What it is drawn in; null until a picture first shows it. */
  node: Container | null;
  kind: NodeKind;
  /** The record is another than the one `node` was drawn from. */
  stale: boolean;
  /** `node` shows where a gesture under way would leave it, not what its record says (`LayerPreview`). */
  previewed: boolean;
}

const keyOf = (annotation: Annotation): string => `${annotation.kind}:${annotation.id}`;
const kindOf = (annotation: Annotation): NodeKind => (annotation.kind === 'text' ? 'text' : annotation.shape === 'stamp' ? 'stamp' : 'ink');

/** The four layers by their labels, in the order they lie in their parent. */
const LAYERS = { onMap: 'annotations-on-map', onMapHidden: 'annotations-on-map-hidden', above: 'annotations', aboveHidden: 'annotations-hidden' } as const;

/**
 * A container of annotations: a render group, so a pan moves it as one and a change in it builds
 * its own instructions alone. Nothing in it takes the pointer: one dispatch decides what a press
 * takes, from the annotations' geometry.
 */
function layer(label: string, zIndex: number): Container {
  return new Container({ label, zIndex, isRenderGroup: true, sortableChildren: true, eventMode: 'none', interactiveChildren: false });
}

/**
 * The drawings and texts of one level as they are drawn, from the list `annotationList` reads, in
 * its order, in four layers: on the map (under the grid, lit by the lighting like the floor) and
 * above the tokens, and beside each of the two a layer for what only the GM sees, drawn paler.
 * Whoever owns the layer shows the GM's two to nobody else (`annotationPlayersView`).
 *
 * An annotation is drawn when a picture first shows it and again only when its record is another
 * object; what no picture shows (`setViews`) is hidden, and one never shown is never built. A
 * pointer move, a pan and a zoom over what is drawn therefore draw nothing. What a picture shows
 * for the first time is drawn `BUILD_POINTS` at a go, the topmost first: whoever owns the layer
 * calls `build` in each frame's tick while `building`. Shared with every page that shows a map.
 */
export class AnnotationLayer {
  readonly onMap = layer(LAYERS.onMap, MAP_LAYER_Z.annotationsOnMap);
  readonly onMapHidden = layer(LAYERS.onMapHidden, MAP_LAYER_Z.annotationsOnMap);
  readonly above = layer(LAYERS.above, MAP_LAYER_Z.annotations);
  readonly aboveHidden = layer(LAYERS.aboveHidden, MAP_LAYER_Z.annotations);
  /** How many annotations were drawn since the layer was made: what a change cost. */
  drawn = 0;
  /** Shows annotations where a gesture under way would leave them, before the store hears of it. */
  readonly previews: LayerPreview;

  private readonly entries = new Map<string, Entry>();
  /** The entries by the annotations of the list as it is now. */
  private byAnnotation = new Map<Annotation, Entry>();
  private readonly stamps = new StampTextures();
  private list: readonly Annotation[] = [];
  /** The parts of the world the pictures show; null shows everything. */
  private views: readonly Box[] | null = null;
  private shown = new Set<Entry>();
  /** What the pictures show and is not drawn yet, a later one lying over an earlier one. */
  private waiting: Entry[] = [];

  /** `parent` takes the four layers, in the order that keeps the GM's own above the others of their place. */
  constructor(parent: Container, private readonly options: AnnotationLayerOptions) {
    this.onMapHidden.alpha = HIDDEN_ANNOTATION_ALPHA;
    this.aboveHidden.alpha = HIDDEN_ANNOTATION_ALPHA;
    parent.addChild(this.onMap, this.onMapHidden, this.above, this.aboveHidden);
    this.previews = new LayerPreview((annotation) => this.entries.get(keyOf(annotation)), () => this.entries.values(), (entry, shown) => this.draw(entry as Entry, shown));
  }

  /** The measure the texts are found, framed and culled by: the size their views are drawn at. */
  get measure(): TextMeasure {
    return measureTextView;
  }

  /** The layers only the GM's view of the canvas shows. */
  get gmLayers(): readonly Container[] {
    return [this.onMapHidden, this.aboveHidden];
  }

  /** The layer an annotation lies in: where the stroke under way of one like it is drawn too. */
  layerOf(place: DrawLayer, hidden: boolean): Container {
    if (place === 'map') return hidden ? this.onMapHidden : this.onMap;
    return hidden ? this.aboveHidden : this.above;
  }

  /** What the drawing or text `id` is drawn in (a text's view, a stamp's sprite, a drawing's graphics); null while no picture has shown it. */
  node(kind: Annotation['kind'], id: string): Container | null {
    return this.entries.get(`${kind}:${id}`)?.node ?? null;
  }

  /** Whether something the pictures show waits to be drawn: `build` draws more of it. */
  get building(): boolean {
    return this.waiting.length > 0;
  }

  /** The annotations to show, in drawing order: what left the list goes, what is new or another object is drawn when a picture shows it. */
  setList(list: readonly Annotation[]): void {
    if (list === this.list) return;
    this.list = list;
    const byAnnotation = new Map<Annotation, Entry>();
    list.forEach((annotation, index) => {
      let entry = this.byAnnotation.get(annotation) ?? this.entries.get(keyOf(annotation));
      if (!entry) {
        entry = { annotation, index, node: null, kind: kindOf(annotation), stale: true, previewed: false };
        this.entries.set(keyOf(annotation), entry);
      } else if (entry.annotation !== annotation) {
        entry.annotation = annotation;
        entry.stale = true;
      }
      if (entry.index !== index) {
        entry.index = index;
        if (entry.node) entry.node.zIndex = index;
      }
      byAnnotation.set(annotation, entry);
    });
    if (byAnnotation.size < this.entries.size) {
      for (const [key, entry] of this.entries) {
        if (byAnnotation.get(entry.annotation) !== entry) this.remove(key, entry);
      }
    }
    this.byAnnotation = byAnnotation;
    this.cull(false);
  }

  /**
   * The parts of the world the pictures show now (the view's camera, a players' frame); null shows
   * every annotation, as a picture of the whole scene needs. `whole` draws all of it at once, for
   * a picture that is rendered right away and must lack nothing.
   */
  setViews(views: readonly Box[] | null, whole = false): void {
    if (views === this.views && !(whole && this.building)) return;
    this.views = views;
    this.cull(whole);
  }

  /** Draws more of what waits to be drawn (`building`). */
  build(): void {
    this.drawWaiting(false);
  }

  destroy(): void {
    for (const entry of this.entries.values()) {
      if (entry.kind === 'text') this.options.sharpness?.forget(entry.annotation.id);
    }
    this.entries.clear();
    this.byAnnotation.clear();
    this.shown.clear();
    this.waiting = [];
    this.stamps.destroy();
    for (const container of [this.onMap, this.onMapHidden, this.above, this.aboveHidden]) destroyTree(container);
  }

  /**
   * Shows what the pictures show and hides the rest. What changed is drawn again at once, so a
   * drag or an undo shows whole; what is new to the pictures is drawn as `drawWaiting` allows.
   */
  private cull(whole: boolean): void {
    const wanted = new Set<Entry>();
    const want = (annotation: Annotation): void => {
      const entry = this.byAnnotation.get(annotation);
      if (entry) wanted.add(entry);
    };
    if (this.views === null) {
      for (const annotation of this.list) want(annotation);
    } else if (this.list.length > 0) {
      const index = annotationIndex(this.list, measureTextView);
      for (const view of this.views) {
        for (const annotation of index.touching(view)) want(annotation);
      }
    }
    for (const entry of this.shown) {
      if (!wanted.has(entry) && entry.node && entry.node.visible) entry.node.visible = false;
    }
    const waiting: Entry[] = [];
    for (const entry of wanted) {
      const node = entry.node;
      if (!node) {
        waiting.push(entry);
        continue;
      }
      if (entry.stale) this.draw(entry);
      // Drawn again, it may be another node (a drawing that became a stamp).
      const drawn = entry.node;
      if (drawn && !drawn.visible) drawn.visible = true;
    }
    this.shown = wanted;
    this.waiting = waiting.sort((a, b) => a.index - b.index);
    this.drawWaiting(whole);
  }

  /** Draws what waits, the topmost first (what was made last is seen first): all of it for `whole`, else until `BUILD_POINTS` are drawn. */
  private drawWaiting(whole: boolean): void {
    let points = 0;
    while (this.waiting.length > 0 && (whole || points < BUILD_POINTS)) {
      const entry = this.waiting.pop()!;
      const { annotation } = entry;
      points += annotation.kind === 'drawing' && annotation.shape !== 'stamp' ? annotation.points.length : NODE_POINTS;
      this.draw(entry);
    }
  }

  private remove(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.shown.delete(entry);
    this.discard(entry);
  }

  private discard(entry: Entry): void {
    if (!entry.node) return;
    if (entry.kind === 'text') this.options.sharpness?.forget(entry.annotation.id);
    destroyTree(entry.node);
    entry.node = null;
  }

  /**
   * Draws an entry from its record, or as `shown` in its place (`LayerPreview`): into the node it has
   * where that is of its kind, else into a new one, in the layer it lies in now.
   */
  private draw(entry: Entry, shown?: Annotation): void {
    const annotation = shown ?? entry.annotation;
    const kind = kindOf(annotation);
    if (entry.kind !== kind) {
      this.discard(entry);
      entry.kind = kind;
    }
    if (!shown) {
      entry.stale = false;
      entry.previewed = false;
    }
    this.drawn += 1;
    let node = entry.node;
    if (annotation.kind === 'text') {
      const element = textElementOf(annotation);
      if (node) updateTextElementView(node, element);
      else node = createTextElementView(element);
      this.options.sharpness?.track(annotation.id, node);
    } else if (annotation.shape === 'stamp') {
      node ??= createStampSprite();
      placeStamp(node as Sprite, annotation, this.stamps, this.options.changed);
    } else {
      node ??= new Graphics({ eventMode: 'none' });
      // A move shown ahead of its write moved the node itself (`LayerPreview.previewMove`).
      node.position.set(0, 0);
      paintDrawing(node as Graphics, annotation, curveTolerance(this.options.zoom(), annotation.width));
    }
    node.label = annotation.id;
    node.zIndex = entry.index;
    const parent = this.layerOf(annotation.layer, annotation.hidden);
    if (node.parent !== parent) parent.addChild(node);
    entry.node = node;
  }
}
