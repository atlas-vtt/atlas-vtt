// @vitest-environment jsdom
import { Container, Graphics, Sprite } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { annotationList } from '../../../src/app/annotations/annotationList';
import { AnnotationLayer, annotationNodeIn, BUILD_POINTS, HIDDEN_ANNOTATION_ALPHA, type TextSharpness } from '../../../src/app/pixi/annotations/AnnotationLayer';
import { AnnotationPlayersView } from '../../../src/app/pixi/annotations/annotationPlayersView';
import { PictureViews } from '../../../src/app/pixi/annotations/PictureViews';
import { MAP_LAYER_Z } from '../../../src/app/pixi/mapLayerOrder';
import { TEXT_CONTENT_LABEL } from '../../../src/app/pixi/textElementView';
import type { DrawingStroke, TextElement } from '../../../src/app/types';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

let restoreGraphics: () => void = () => undefined;
beforeEach(() => {
  restoreGraphics = stubJsdomGraphics();
});
afterEach(() => restoreGraphics());

const pen = (id: string, more: Partial<DrawingStroke> = {}): DrawingStroke =>
  ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#ffffff', width: 4, opacity: 1, ...more });
const label = (id: string, more: Partial<TextElement> = {}): TextElement =>
  ({ id, kind: 'text', x: 50, y: 50, text: 'Gate', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', ...more });

interface Scene {
  parent: Container;
  layer: AnnotationLayer;
  sharpness: { track: ReturnType<typeof vi.fn<TextSharpness['track']>>; forget: ReturnType<typeof vi.fn<TextSharpness['forget']>> };
  show(drawings: Record<string, DrawingStroke>, texts?: Record<string, TextElement>): void;
}

function scene(): Scene {
  const parent = new Container();
  const sharpness = { track: vi.fn<TextSharpness['track']>(), forget: vi.fn<TextSharpness['forget']>() };
  const layer = new AnnotationLayer(parent, { zoom: () => 1, sharpness });
  return { parent, layer, sharpness, show: (drawings, texts = {}) => layer.setList(annotationList({ drawings, texts })) };
}

describe('AnnotationLayer', () => {
  it('draws every annotation once, and again only the one whose record is another', () => {
    const s = scene();
    const a = pen('a');
    const b = pen('b', { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] });
    const t = label('t');
    s.show({ a, b }, { t });
    expect(s.layer.drawn).toBe(3);
    const nodes = { a: s.layer.node('drawing', 'a'), b: s.layer.node('drawing', 'b'), t: s.layer.node('text', 't') };
    expect(nodes.a).toBeInstanceOf(Graphics);
    expect(nodes.t?.getChildByLabel(TEXT_CONTENT_LABEL)).not.toBeNull();

    // The same records in a new list: nothing is drawn.
    s.show({ a, b }, { t });
    expect(s.layer.drawn).toBe(3);

    // One record is another (a drag, an undo): its node is drawn again in place, the others are left as they are.
    s.show({ a, b: { ...b, color: '#ff0000' } }, { t });
    expect(s.layer.drawn).toBe(4);
    expect(s.layer.node('drawing', 'b')).toBe(nodes.b);
    expect(s.layer.node('drawing', 'a')).toBe(nodes.a);

    s.show({ a, b }, { t: { ...t, text: 'Gatehouse' } });
    expect(s.layer.drawn).toBe(6);
    expect(s.layer.node('text', 't')).toBe(nodes.t);
  });

  it('removes what left the list, and forgets its text', () => {
    const s = scene();
    s.show({ a: pen('a') }, { t: label('t') });
    const [gone, text] = [s.layer.node('drawing', 'a'), s.layer.node('text', 't')];
    s.show({}, {});
    expect(gone?.destroyed).toBe(true);
    expect(text?.destroyed).toBe(true);
    expect(s.layer.node('drawing', 'a')).toBeNull();
    expect(s.sharpness.forget).toHaveBeenCalledWith('t');
  });

  it('lays texts and drawings in their one order, and moves a node that changed its place without drawing it', () => {
    const s = scene();
    const a = pen('a', { order: 1 });
    const t = label('t', { order: 2 });
    const b = pen('b', { order: 3 });
    s.show({ a, b }, { t });
    const z = (kind: 'drawing' | 'text', id: string): number => s.layer.node(kind, id)!.zIndex;
    expect(z('drawing', 'a')).toBeLessThan(z('text', 't'));
    expect(z('text', 't')).toBeLessThan(z('drawing', 'b'));
    const drawn = s.layer.drawn;
    // A drawing before the others goes: the ones after it move down, and none is drawn again.
    s.show({ b }, { t });
    expect(s.layer.drawn).toBe(drawn);
    expect(z('text', 't')).toBe(0);
    expect(z('drawing', 'b')).toBe(1);
  });

  it('keeps what only the GM sees in layers of its own, paler, on the map and above', () => {
    const s = scene();
    s.show({ shown: pen('shown'), secret: pen('secret', { hidden: true }), floor: pen('floor', { layer: 'map' }), trap: pen('trap', { layer: 'map', hidden: true }) }, { note: label('note', { hidden: true }) });
    const parentOf = (kind: 'drawing' | 'text', id: string): Container | null => s.layer.node(kind, id)?.parent ?? null;
    expect(parentOf('drawing', 'shown')).toBe(s.layer.above);
    expect(parentOf('drawing', 'secret')).toBe(s.layer.aboveHidden);
    expect(parentOf('text', 'note')).toBe(s.layer.aboveHidden);
    expect(parentOf('drawing', 'floor')).toBe(s.layer.onMap);
    expect(parentOf('drawing', 'trap')).toBe(s.layer.onMapHidden);
    expect(s.layer.gmLayers).toEqual([s.layer.onMapHidden, s.layer.aboveHidden]);
    for (const hidden of s.layer.gmLayers) expect(hidden.alpha).toBe(HIDDEN_ANNOTATION_ALPHA);
    expect(s.layer.onMap.zIndex).toBe(MAP_LAYER_Z.annotationsOnMap);
    expect(MAP_LAYER_Z.annotationsOnMap).toBeGreaterThan(MAP_LAYER_Z.liquids);
    expect(MAP_LAYER_Z.annotationsOnMap).toBeLessThan(MAP_LAYER_Z.measureBodies);
    expect(s.layer.above.zIndex).toBe(MAP_LAYER_Z.annotations);
    // Found from the map's container too, by whoever has no layer to ask.
    expect(annotationNodeIn(s.parent, 'trap')).toBe(s.layer.node('drawing', 'trap'));
    expect(annotationNodeIn(s.parent, 'nothing')).toBeNull();
  });

  it('moves a node into the other layer when its drawing is shown to the players, or hidden from them', () => {
    const s = scene();
    const a = pen('a');
    s.show({ a });
    const node = s.layer.node('drawing', 'a');
    s.show({ a: { ...a, hidden: true } });
    expect(s.layer.node('drawing', 'a')).toBe(node);
    expect(node?.parent).toBe(s.layer.aboveHidden);
    s.show({ a: { ...a, layer: 'map' } });
    expect(node?.parent).toBe(s.layer.onMap);
  });

  it('draws a stamp as a sprite, and makes a new node for a drawing that became one', () => {
    const s = scene();
    const a = pen('a');
    s.show({ a });
    const ink = s.layer.node('drawing', 'a');
    s.show({ a: { ...a, type: 'icon', icon: 'no-such-symbol', points: [{ x: 10, y: 20 }], width: 70 } });
    const stamp = s.layer.node('drawing', 'a');
    expect(stamp).toBeInstanceOf(Sprite);
    expect(ink?.destroyed).toBe(true);
    expect([stamp?.x, stamp?.y, stamp?.width]).toEqual([10, 20, 70]);
  });

  it('builds only what a picture shows, hides what none shows, and draws a changed record when it comes into view', () => {
    const s = scene();
    const near = pen('near');
    const far = pen('far', { points: [{ x: 5000, y: 5000 }, { x: 5100, y: 5000 }] });
    s.layer.setViews([{ minX: -50, minY: -50, maxX: 500, maxY: 500 }]);
    s.show({ near, far });
    expect(s.layer.drawn).toBe(1);
    expect(s.layer.node('drawing', 'far')).toBeNull();

    s.layer.setViews([{ minX: 4900, minY: 4900, maxX: 5500, maxY: 5500 }]);
    expect(s.layer.drawn).toBe(2);
    expect(s.layer.node('drawing', 'near')?.visible).toBe(false);
    expect(s.layer.node('drawing', 'far')?.visible).toBe(true);

    // Changed while no picture shows it: drawn when one does again, not before.
    s.show({ near: { ...near, color: '#00ff00' }, far });
    expect(s.layer.drawn).toBe(2);
    s.layer.setViews([{ minX: -50, minY: -50, maxX: 500, maxY: 500 }, { minX: 4900, minY: 4900, maxX: 5500, maxY: 5500 }]);
    expect(s.layer.drawn).toBe(3);
    expect(s.layer.node('drawing', 'near')?.visible).toBe(true);

    // A picture of the whole scene shows everything.
    s.layer.setViews([{ minX: -50, minY: -50, maxX: 60, maxY: 60 }]);
    expect(s.layer.node('drawing', 'far')?.visible).toBe(false);
    s.layer.setViews(null);
    expect(s.layer.node('drawing', 'far')?.visible).toBe(true);
  });

  it('draws what a picture shows for the first time a part at a go, the topmost first, and all of it for a picture that must lack nothing', () => {
    const s = scene();
    const STROKES = 300;
    const POINTS = 100;
    const strokes = Object.fromEntries(Array.from({ length: STROKES }, (_, index) =>
      [`d${index}`, pen(`d${index}`, { points: Array.from({ length: POINTS }, (__, step) => ({ x: step, y: index })) })]));
    s.show(strokes);
    const atOnce = BUILD_POINTS / POINTS;
    expect(s.layer.drawn).toBe(atOnce);
    expect(s.layer.building).toBe(true);
    // What was made last is seen first.
    expect(s.layer.node('drawing', `d${STROKES - 1}`)).not.toBeNull();
    expect(s.layer.node('drawing', 'd0')).toBeNull();
    s.layer.build();
    expect(s.layer.drawn).toBe(2 * atOnce);

    // A drawing made now is the topmost: it does not wait behind the others.
    s.show({ ...strokes, made: pen('made', { order: 1 }) });
    expect(s.layer.node('drawing', 'made')).not.toBeNull();
    // One that is drawn and changed is drawn again at once, whatever waits.
    const before = s.layer.drawn;
    s.show({ ...strokes, [`d${STROKES - 1}`]: { ...strokes[`d${STROKES - 1}`]!, color: '#ff0000' }, made: pen('made', { order: 1 }) });
    expect(s.layer.drawn).toBeGreaterThan(before);
    expect(s.layer.building).toBe(true);

    // A picture that is rendered right away has all of it.
    s.layer.setViews(null, true);
    expect(s.layer.building).toBe(false);
    expect(s.layer.node('drawing', 'd0')).not.toBeNull();
    const whole = s.layer.drawn;
    s.layer.build();
    expect(s.layer.drawn).toBe(whole);
  });

  it('tells whoever lets the pointer take texts of each view once, and whoever keeps them sharp of each drawing of it', () => {
    const parent = new Container();
    const textView = vi.fn();
    const sharpness = { track: vi.fn<TextSharpness['track']>(), forget: vi.fn<TextSharpness['forget']>() };
    const layer = new AnnotationLayer(parent, { zoom: () => 1, sharpness, textView });
    const t = label('t');
    layer.setList(annotationList({ texts: { t } }));
    layer.setList(annotationList({ texts: { t: { ...t, x: 80 } } }));
    expect(textView).toHaveBeenCalledOnce();
    expect(textView).toHaveBeenCalledWith(expect.objectContaining({ id: 't' }), layer.node('text', 't'));
    expect(sharpness.track).toHaveBeenCalledTimes(2);
    expect(layer.node('text', 't')?.x).toBe(80);
  });

  it('lets the texts above the tokens take the pointer, never those on the map', () => {
    const s = scene();
    expect(s.layer.above.interactiveChildren).toBe(true);
    expect(s.layer.onMap.interactiveChildren).toBe(false);
    s.layer.setTextsTakePointer(false);
    expect([s.layer.above.interactiveChildren, s.layer.aboveHidden.interactiveChildren]).toEqual([false, false]);
  });

  it('destroys its nodes and its layers', () => {
    const s = scene();
    s.show({ a: pen('a') }, { t: label('t') });
    const nodes = [s.layer.node('drawing', 'a'), s.layer.node('text', 't')];
    s.layer.destroy();
    expect(nodes.every((node) => node?.destroyed)).toBe(true);
    expect(s.layer.above.destroyed).toBe(true);
    expect(s.parent.children).toHaveLength(0);
  });
});

describe('AnnotationPlayersView', () => {
  it('shows what only the GM sees on the GM\'s view of the canvas, and leaves it out of a players\' frame and of a picture of the scene', () => {
    const s = scene();
    const chrome = new Container();
    const view = new AnnotationPlayersView([...s.layer.gmLayers, chrome]);
    const gmOnly = [s.layer.onMapHidden, s.layer.aboveHidden, chrome];
    expect(view.playerViewLayers()).toEqual(gmOnly.map((layer) => ({ layer, visible: false })));
    expect(view.pictureLayers()).toEqual(gmOnly.map((layer) => ({ layer, visible: false })));
    view.showOnCanvas(true);
    expect(gmOnly.map((layer) => layer.visible)).toEqual([false, false, false]);
    // What players see is never touched.
    expect([s.layer.onMap.visible, s.layer.above.visible]).toEqual([true, true]);
    view.showOnCanvas(false);
    expect(gmOnly.map((layer) => layer.visible)).toEqual([true, true, true]);
  });
});

describe('PictureViews', () => {
  function views(): { camera: { x: number; y: number; scale: { x: number }; screenWidth: number; screenHeight: number }; pictures: PictureViews; told: ReturnType<typeof vi.fn<(views: readonly unknown[] | null, whole: boolean) => void>> } {
    const camera = { x: 0, y: 0, scale: { x: 1 }, screenWidth: 800, screenHeight: 600 };
    const told = vi.fn<(views: readonly unknown[] | null, whole: boolean) => void>();
    return { camera, told, pictures: new PictureViews(camera as unknown as Viewport, told) };
  }

  it('tells the camera\'s part of the world with a margin when it is another, and nothing while it rests', () => {
    const { camera, pictures, told } = views();
    pictures.look();
    expect(told).toHaveBeenLastCalledWith([{ minX: -200, minY: -150, maxX: 1000, maxY: 750 }], false);
    pictures.look();
    expect(told).toHaveBeenCalledOnce();
    // Panned 100 px to the right at twice the size: the camera shows the half of it.
    Object.assign(camera, { x: -200, scale: { x: 2 } });
    pictures.look();
    expect(told).toHaveBeenLastCalledWith([{ minX: 0, minY: -75, maxX: 600, maxY: 375 }], false);
    expect(told).toHaveBeenCalledTimes(2);
  });

  it('tells everything while the camera has no size', () => {
    const { camera, pictures, told } = views();
    camera.screenWidth = 0;
    pictures.look();
    expect(told).not.toHaveBeenCalled();
    camera.screenWidth = 800;
    pictures.look();
    camera.scale = { x: 0 };
    pictures.look();
    expect(told).toHaveBeenLastCalledWith(null, false);
  });

  it('tells a region with the camera, from the next look on, until it is let go of', () => {
    const { pictures, told } = views();
    pictures.look();
    const release = pictures.addRegion({ rect: { x: 2000, y: 2000, width: 400, height: 200 }, worldPerScreenPixel: 1 });
    expect(told).toHaveBeenCalledOnce();
    pictures.look();
    expect(told.mock.lastCall?.[0]).toEqual([{ minX: -200, minY: -150, maxX: 1000, maxY: 750 }, { minX: 1900, minY: 1950, maxX: 2500, maxY: 2250 }]);
    release();
    pictures.look();
    expect(told.mock.lastCall?.[0]).toHaveLength(1);
  });

  it('shows a picture rendered at once whole, and puts back what was shown', () => {
    const { pictures, told } = views();
    pictures.look();
    const camera = told.mock.lastCall?.[0];
    // A frame within what the camera shows changes nothing.
    pictures.showFor({ rect: { x: 100, y: 100, width: 300, height: 200 }, worldPerScreenPixel: 1 })();
    expect(told).toHaveBeenCalledOnce();
    // One elsewhere is shown beside it, whole.
    const restoreFrame = pictures.showFor({ rect: { x: 3000, y: 100, width: 300, height: 200 }, worldPerScreenPixel: 1 });
    expect(told).toHaveBeenLastCalledWith([...(camera ?? []), { minX: 3000, minY: 100, maxX: 3300, maxY: 300 }], true);
    restoreFrame();
    expect(told).toHaveBeenLastCalledWith(camera, false);
    // A picture of the scene shows all of it.
    const restoreScene = pictures.showFor(null);
    expect(told).toHaveBeenLastCalledWith(null, true);
    restoreScene();
    expect(told).toHaveBeenLastCalledWith(camera, false);
  });
});
