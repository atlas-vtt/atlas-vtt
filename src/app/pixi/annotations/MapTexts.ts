import { DOMAdapter, type Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import { forgetAnnotationIndexes } from '../../annotations/annotationHit';
import type { DrawMode, TextAnnotation } from '../../annotations/annotationTypes';
import { drawCell, textHeight } from '../../annotations/drawSizes';
import type { ViewAtlasState } from '../../storeFactory';
import type { LayerVisibility } from '../playerSafeFrame';
import { watchTextFonts } from '../textFonts';
import { keepTextBreaks } from './textBreaksKept';
import { TextPlacing } from './TextPlacing';
import { TextTyping } from './TextTyping';

export interface MapTextsDeps {
  readonly viewport: Viewport;
  readonly store: StoreApi<ViewAtlasState>;
  /** Where the mark of a dragged width goes: the GM's own layer. */
  readonly chrome: Container;
  /** What the text `id` is drawn in; null while no picture has shown it. */
  node(id: string): Container | null;
  /** Whether the canvas shows the GM's view. */
  gmView(): boolean;
  /** The mode the Draw tool is in; null while another tool is in hand. */
  mode(): DrawMode | null;
  /** Tells the GM that the level shown holds as many texts as it may. */
  full(): void;
  accent(): number;
  /** A face of the texts has loaded: whoever draws and frames texts does so anew. */
  fontsArrived(): void;
  /** A text is being typed, or no longer: the selection's frame hides and shows by it. */
  typingChanged(): void;
  requestRender(): void;
}

/**
 * What the texts of a map need beyond being drawn: typing them on the map (`TextTyping`, started
 * by a press of the Text mode through `TextPlacing`, or on a text that is there), their faces
 * loading in the canvas's own document, and the line breaks a text with a width keeps
 * (`keepTextBreaks`).
 *
 * While a text is typed, its own drawing is hidden on the canvas: what it is made of is hidden,
 * not its view, which stays the layer's to show and hide. Every other picture (a players' frame,
 * a picture of the scene) shows it as the map has it (`typedLayers`).
 */
export class MapTexts {
  readonly typing: TextTyping;
  private readonly placing: TextPlacing;
  private readonly unwatchFonts: (() => void) | undefined;
  /** The view of the text that is typed, hidden on the canvas. */
  private hidden: Container | null = null;

  constructor(private readonly deps: MapTextsDeps) {
    const { viewport, store } = deps;
    this.typing = new TextTyping({
      viewport,
      store,
      gmView: () => deps.gmView(),
      typing: (id) => this.hide(id === null ? null : deps.node(id)),
      full: () => deps.full(),
      changed: () => deps.typingChanged(),
    });
    this.placing = new TextPlacing(viewport, deps.chrome, {
      ready: () => deps.gmView() && deps.mode() === 'text',
      lineHeight: () => {
        const { drawTool, grid } = store.getState();
        return textHeight(drawTool.size, drawCell(grid));
      },
      accent: () => deps.accent(),
      place: (at, width) => this.typing.begin(at, width),
    });
    // A view without a document's fonts (a test) has every face at once. PIXI measures texts on a canvas of
    // the document it was loaded in, which is another than the canvas' own in a second window: a face is
    // there once both have it, or a text would be measured in a stand-in and keep its width.
    const fonts = viewport.options.events?.domElement?.ownerDocument?.fonts;
    this.unwatchFonts = fonts && watchTextFonts(fonts, () => this.fontsArrived(), DOMAdapter.get().getFontFaceSet());
  }

  /** Opens the field on a text of the map. */
  edit(text: TextAnnotation): void {
    this.typing.edit(text);
  }

  /** The Draw tool came into hand, went, or works in another mode. */
  setMode(mode: DrawMode | null): void {
    this.placing.setEnabled(mode === 'text');
  }

  hearPressesLast(): void {
    this.placing.hearPressesLast();
  }

  /** The view's state changed; `left` where what was being placed belongs to it no longer. */
  follow(state: ViewAtlasState, previous: ViewAtlasState, left: boolean): void {
    if (left) this.placing.cancel();
    this.typing.follow(state, previous);
  }

  /** The texts' records are others: a text with a width that lost where its lines break gets it back, in the same undo step. */
  recordsChanged(): void {
    keepTextBreaks(this.deps.store);
  }

  /** The map is no longer what the GM works on, or the canvas shows the players' picture: what is typed is written. */
  finish(): void {
    this.placing.cancel();
    this.typing.finish();
  }

  /** What a picture other than the GM's canvas changes for its render: the text being typed shows there as the map has it. */
  typedLayers(): LayerVisibility[] {
    const node = this.hidden;
    return node && !node.destroyed ? node.children.map((layer) => ({ layer, visible: true })) : [];
  }

  destroy(): void {
    // What is typed is written while the store still hears.
    this.typing.destroy();
    this.unwatchFonts?.();
    this.placing.destroy();
  }

  private hide(node: Container | null): void {
    const before = this.hidden;
    if (before && !before.destroyed) for (const child of before.children) child.visible = true;
    this.hidden = node;
    if (node) for (const child of node.children) child.visible = false;
    this.deps.requestRender();
  }

  private fontsArrived(): void {
    forgetAnnotationIndexes();
    this.deps.fontsArrived();
    keepTextBreaks(this.deps.store);
    this.typing.fontsArrived();
    this.deps.requestRender();
  }
}
