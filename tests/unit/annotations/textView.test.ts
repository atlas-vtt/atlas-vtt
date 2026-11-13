// @vitest-environment jsdom
import { Container, type Graphics, type Text } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { annotationList, readText } from '../../../src/app/annotations/annotationList';
import type { TextAnnotation } from '../../../src/app/annotations/annotationTypes';
import { FONT_FAMILIES, TEXT_PLATE } from '../../../src/app/annotations/madeText';
import { HALO } from '../../../src/app/annotations/textLook';
import { pickDrawStyle } from '../../../src/app/packages/components/toolbar/drawStyleStore';
import { AnnotationLayer } from '../../../src/app/pixi/annotations/AnnotationLayer';
import { createTextElementView, showTextHalo, TEXT_BACKGROUND_LABEL, TEXT_CONTENT_LABEL, updateTextElementView } from '../../../src/app/pixi/textElementView';
import { textFontReady, watchTextFonts, type FontSource } from '../../../src/app/pixi/textFonts';
import { measureTextView, textBreaks, textLayout } from '../../../src/app/pixi/textLayout';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { TextElement } from '../../../src/app/types';
import { drawScene, type DrawScene } from '../../helpers/drawScene';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

// jsdom measures every letter 8 wide and every line 10 high (`stubJsdomGraphics`).
const LETTER = 8;
const LINE = 10;

let restoreGraphics: () => void = () => undefined;
let current: DrawScene | undefined;
beforeEach(() => {
  restoreGraphics = stubJsdomGraphics();
});
afterEach(() => {
  current?.destroy();
  current = undefined;
  restoreGraphics();
});

let made = 0;
const text = (fields: Partial<TextElement> = {}): TextAnnotation =>
  readText(`t${made}`, { id: `t${made++}`, kind: 'text', x: 100, y: 50, text: 'Gate', fontSize: 20, fontFamily: 'Arial', color: '#ffffff', ...fields })!;
const words = (view: Container): Text => view.getChildByLabel(TEXT_CONTENT_LABEL) as Text;
const strokeOf = (view: Container): number => words(view).style.stroke?.width ?? 0;

describe('how a text is set', () => {
  it('is as wide as its words where it has no width, in the lines typed into it', () => {
    expect(textLayout(text({ text: 'Old\nMill house' }))).toEqual({ lines: ['Old', 'Mill house'], width: 10 * LETTER, height: 2 * LINE, lineHeight: LINE, ascent: 8 });
    expect(textLayout(text({ text: '' }))).toMatchObject({ lines: [''], width: 0, height: LINE });
  });

  it('wraps at its width, in the lines it saved, and anew where it saved none', () => {
    const wrapped = text({ text: 'aaa bbb ccc', width: 60 });
    expect(textLayout(wrapped)).toMatchObject({ lines: ['aaa bbb', 'ccc'], width: 60, height: 2 * LINE });
    expect(textBreaks(wrapped, 60)).toEqual([8]);
    // What another device saved is drawn as it broke there, whatever this one would measure.
    expect(textLayout(text({ text: 'aaa bbb ccc', width: 60, breaks: [4, 8] })).lines).toEqual(['aaa', 'bbb', 'ccc']);
    expect(textLayout(text({ text: 'aaa bbb ccc', width: 60, breaks: [] })).lines).toEqual(['aaa bbb ccc']);
    // Without a width the breaks say nothing.
    expect(textLayout(text({ text: 'aaa bbb ccc', breaks: [4] })).lines).toEqual(['aaa bbb ccc']);
  });

  it('measures the box of the words, and the plate around them', () => {
    expect(measureTextView(text({}))).toEqual({ width: 4 * LETTER, height: LINE });
    expect(measureTextView(text({ ...TEXT_PLATE }))).toEqual({ width: 4 * LETTER + 16, height: LINE + 16 });
    // The halo of the Outline look changes nothing of the box: a look never moves a text's handles.
    expect(measureTextView(text({ outline: true }))).toEqual({ width: 4 * LETTER, height: LINE });
    expect(measureTextView(text({ text: 'aaa bbb ccc', width: 60 }))).toEqual({ width: 60, height: 2 * LINE });
  });
});

describe('a text\'s view', () => {
  it('draws the Outline look as a line around the letters, dark under light text and light under dark, and leaves it out where told', () => {
    const light = createTextElementView(text({ outline: true, fontSize: 40 }));
    expect(words(light).style.stroke).toMatchObject({ width: 2 * HALO.share * 40, alpha: HALO.alpha, join: 'round' });
    const dark = createTextElementView(text({ outline: true, color: '#101010' }));
    expect(words(dark).style.stroke?.color).not.toBe(words(light).style.stroke?.color);
    // Room around the letters, so the halo and a display face's swashes are not cut off.
    expect(words(light).style.padding).toBeGreaterThan(0);
    showTextHalo(light, false);
    expect(strokeOf(light)).toBe(0);
    // An edit keeps what was decided for the picture.
    updateTextElementView(light, text({ outline: true, text: 'Door' }));
    expect(strokeOf(light)).toBe(0);
    showTextHalo(light, true);
    expect(strokeOf(light)).toBeGreaterThan(0);
  });

  it('draws a text made before there were looks as it always was: no line, no room around it, its plate around its words', () => {
    const old = createTextElementView(text({ backgroundColor: '#000000', padding: 8, borderRadius: 4, opacity: 0.7 }));
    expect([strokeOf(old), words(old).style.padding, words(old).anchor.x, words(old).x]).toEqual([0, 0, 0.5, 0]);
    const plate = (old.getChildByLabel(TEXT_BACKGROUND_LABEL) as Graphics).getLocalBounds();
    expect([plate.x, plate.y, plate.width, plate.height]).toEqual([-(4 * LETTER) / 2 - 8, -LINE / 2 - 8, 4 * LETTER + 16, LINE + 16]);
    showTextHalo(old, false);
    expect(strokeOf(old)).toBe(0);
    const plain = createTextElementView(text({}));
    expect([strokeOf(plain), words(plain).style.padding]).toEqual([0, 0]);
    expect((plain.getChildByLabel(TEXT_BACKGROUND_LABEL) as Graphics).getLocalBounds().width).toBe(0);
  });

  it('sets a text with a width at the side of its box that its alignment names', () => {
    const at = (align: TextElement['align'], more: Partial<TextElement> = {}): number[] => {
      const view = createTextElementView(text({ text: 'aaa bbb ccc', width: 60, align, ...more }));
      return [words(view).anchor.x, words(view).x];
    };
    expect(words(createTextElementView(text({ text: 'aaa bbb ccc', width: 60 }))).text).toBe('aaa bbb\nccc');
    expect(at('left')).toEqual([0, -30]);
    expect(at('center')).toEqual([0.5, 0]);
    expect(at('right')).toEqual([1, 30]);
    // The halo widens the picture by half its line on each side: the letters stay where they are without it.
    const halo = HALO.share * 20;
    expect(at('left', { outline: true })).toEqual([0, -30 - halo]);
    expect(at('right', { outline: true })).toEqual([1, 30 + halo]);
  });
});

describe('the faces of texts', () => {
  it('are waited for: a text in a face that has not loaded is neither measured nor drawn until it has', async () => {
    let loaded = false;
    let arrive: () => void = () => undefined;
    const source: FontSource = { check: () => loaded, load: vi.fn(() => new Promise<void>((resolve) => { arrive = resolve; })) };
    const arrived = vi.fn();
    const stop = watchTextFonts(source, arrived);
    const mono = text({ fontFamily: FONT_FAMILIES.mono, text: 'Handout' });
    const parent = new Container();
    const layer = new AnnotationLayer(parent, { zoom: () => 1 });
    const plain = text({ x: 300 });
    layer.setList(annotationList({ drawings: {}, texts: { [mono.id]: mono.record, [plain.id]: plain.record } }));
    // A face the device brings is there at once; the bundled one is asked for, once.
    expect(layer.node('text', plain.id)).not.toBeNull();
    expect(layer.node('text', mono.id)).toBeNull();
    expect(textFontReady(mono.fontFamily)).toBe(false);
    expect(source.load).toHaveBeenCalledOnce();
    // Until then it has a guessed size, so it can be found, and nothing is kept of the guess.
    const guessed = measureTextView(mono);
    expect(guessed.width).not.toBe(7 * LETTER);
    loaded = true;
    arrive();
    await vi.waitFor(() => expect(arrived).toHaveBeenCalledOnce());
    layer.fontsArrived();
    expect(layer.node('text', mono.id)).not.toBeNull();
    expect(measureTextView(mono)).toEqual({ width: 7 * LETTER, height: LINE });
    layer.destroy();
    stop();
  });

  it('are waited for in both documents where the canvas is in another than the one texts are measured in', async () => {
    // The canvas' own document (a second window) has the face; the document PIXI measures in has not loaded it yet.
    const canvas: FontSource = { check: () => true, load: vi.fn(() => Promise.resolve()) };
    let loaded = false;
    let arrive: () => void = () => undefined;
    const measured: FontSource = { check: () => loaded, load: vi.fn(() => new Promise<void>((resolve) => { arrive = resolve; })) };
    const arrived = vi.fn();
    const stop = watchTextFonts(canvas, arrived, measured);
    // A face settled before for other documents says nothing of these: it is asked of them.
    const scifi = FONT_FAMILIES.scifi;
    expect(textFontReady(scifi)).toBe(false);
    expect([vi.mocked(canvas.load).mock.calls.length, vi.mocked(measured.load).mock.calls.length]).toEqual([1, 1]);
    expect(textFontReady(scifi)).toBe(false);
    expect(measured.load).toHaveBeenCalledOnce();
    loaded = true;
    arrive();
    await vi.waitFor(() => expect(arrived).toHaveBeenCalledOnce());
    expect(textFontReady(scifi)).toBe(true);
    stop();
  });
});

describe('where a text with a width keeps its line breaks', () => {
  const steps = (s: DrawScene): number => getHistoryStore(s.store)!.getState().pastStates.length;

  it('gets them back in the same undo step when the bars set it in other letters', () => {
    const s = current = drawScene();
    const id = s.store.getState().addText({ x: 300, y: 300, text: 'aaa bbb ccc', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', width: 60 });
    // Written without them (by hand, by an older tool), it has them as soon as it is on the map, within the step that put it there.
    expect(s.store.getState().objects.texts[id]).toMatchObject({ breaks: [8] });
    expect(steps(s)).toBe(1);
    s.tool({ mode: 'select' });
    s.store.getState().setSelection([id]);
    s.store.getState().updateText(id, { breaks: [4, 8] });
    const before = steps(s);
    pickDrawStyle(s.store, 'bold', true);
    expect(s.store.getState().objects.texts[id]).toMatchObject({ bold: true, breaks: [8] });
    expect(steps(s)).toBe(before + 1);
    getHistoryStore(s.store)!.getState().undo();
    expect(s.store.getState().objects.texts[id]).toMatchObject({ breaks: [4, 8] });
    expect(s.store.getState().objects.texts[id]).not.toHaveProperty('bold');
  });

  it('leaves a locked text and a text without a width as they are', () => {
    const s = current = drawScene();
    const locked = s.store.getState().addText({ x: 300, y: 300, text: 'aaa bbb ccc', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', width: 60, locked: true });
    const free = s.store.getState().addText({ x: 300, y: 400, text: 'aaa bbb ccc', fontSize: 24, fontFamily: 'Arial', color: '#ffffff' });
    expect(s.store.getState().objects.texts[locked]).not.toHaveProperty('breaks');
    expect(s.store.getState().objects.texts[free]).not.toHaveProperty('breaks');
  });
});
