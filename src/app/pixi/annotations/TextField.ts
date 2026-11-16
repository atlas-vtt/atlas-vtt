import { MAX_TEXT_LENGTH, type TextAlign, type TextAnnotation } from '../../annotations/annotationTypes';
import { cssFont, haloOf, type TextHalo } from '../../annotations/textLook';
import { plateReach, type TextLayout } from '../textLayout';

/** How the field looks and how large it is, in the pixels of the screen: the text's own units times its scale and the camera's zoom. */
export interface FieldLook {
  /** The face, as a stylesheet's `font` shorthand names it. */
  readonly font: string;
  /** '#rrggbb'. */
  readonly color: string;
  readonly align: TextAlign;
  /** The words wrap at `width`; else the field is as wide as they are. */
  readonly wraps: boolean;
  /** The box of the words. */
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
  /** From the box's top to the line the first line's letters stand on, as the map draws them. */
  readonly ascent: number;
  readonly halo: TextHalo | null;
  readonly plate: { readonly color: string; readonly opacity: number; readonly reach: number; readonly radius: number } | null;
}

/** How the field of `draft` looks on a screen that shows each of the text's units as `pixels` pixels. */
export function fieldLook(draft: TextAnnotation, layout: TextLayout, pixels: number): FieldLook {
  const halo = draft.look === 'outline' ? haloOf(draft.color, draft.fontSize) : null;
  return {
    font: cssFont({ ...draft, fontSize: draft.fontSize * pixels }),
    color: draft.color,
    align: draft.align,
    wraps: draft.width !== null,
    width: layout.width * pixels,
    height: layout.height * pixels,
    lineHeight: layout.lineHeight * pixels,
    ascent: layout.ascent * pixels,
    halo: halo && { ...halo, width: halo.width * pixels },
    plate: draft.backgroundColor === null ? null : { color: draft.backgroundColor, opacity: draft.opacity, reach: plateReach(draft) * pixels, radius: draft.borderRadius * pixels },
  };
}

/** Where the field lies: the map of its own pixels, from the top left corner of the words' box, to the pixels of what holds it (a turn and a move). */
export interface FieldPlace {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

export interface FieldHandlers {
  /** The words changed. */
  input(): void;
  /** Enter, without Shift and outside a composition. */
  enter(): void;
  escape(): void;
  /** The field lost the keyboard. */
  blurred(): void;
}

/** Room beside the words, as a share of the font size, in which the caret shows at a line's end. */
const CARET_ROOM = 0.3;

const rgba = (color: string, alpha: number): string => {
  const value = parseInt(color.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

/**
 * The field a map text is typed in: a `<textarea>` laid over the canvas where the text stands, in
 * its face, size, colour, alignment and width, turned and scaled as it is. A textarea, because
 * the words of a map text are plain: it keeps its own undo, selection, clipboard and composition
 * (IME), and nothing but text can be pasted into it.
 *
 * It is laid out in the pixels of the screen, as large as the camera shows the text, and turned
 * and moved to its place by one transform (`place`); a zoom sets it anew. A line's letters stand
 * where the map draws them: the field is shifted by the difference between where a browser puts
 * a line's baseline and where PIXI does, measured in a hidden twin of the field (`probe`).
 */
export class TextField {
  private readonly root: HTMLDivElement;
  private readonly plate: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly probe: HTMLDivElement;
  private readonly mark: HTMLSpanElement;
  /** The face and line height the baseline was last measured for, and what was found. */
  private measured = { key: '', baseline: 0 };
  private placed = '';
  /** A composition (IME) is under way, or ended in this very task: its keys are its own. */
  private composing = false;

  /** `host` holds the canvas; the field is its child, over the canvas and under the view's bars. */
  constructor(host: HTMLElement, handlers: FieldHandlers) {
    this.root = host.createDiv({ cls: 'atlas-vtt-plugin atlas-map-text-field' });
    this.plate = this.root.createDiv({ cls: 'atlas-map-text-field__plate' });
    this.input = this.root.createEl('textarea', { cls: 'atlas-map-text-field__input', attr: { rows: '1', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', maxlength: String(MAX_TEXT_LENGTH) } });
    this.probe = host.createDiv({ cls: 'atlas-vtt-plugin atlas-map-text-probe', text: 'x', attr: { 'aria-hidden': 'true' } });
    this.mark = this.probe.createSpan({ cls: 'atlas-map-text-probe__mark' });
    this.input.addEventListener('input', () => handlers.input());
    this.input.addEventListener('blur', () => handlers.blurred());
    this.input.addEventListener('compositionstart', () => {
      this.composing = true;
    });
    // Some browsers send the Enter that ended a composition after its end: it still belongs to it.
    this.input.addEventListener('compositionend', () => this.input.win.setTimeout(() => {
      this.composing = false;
    }, 0));
    this.input.addEventListener('keydown', (event) => {
      if (event.isComposing || this.composing) return;
      if (event.key !== 'Escape' && (event.key !== 'Enter' || event.shiftKey)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') handlers.escape();
      else handlers.enter();
    });
  }

  get value(): string {
    return this.input.value;
  }

  set value(words: string) {
    this.input.value = words;
  }

  /** Whether the field has the keyboard. */
  get focused(): boolean {
    return this.input.ownerDocument.activeElement === this.input;
  }

  /** Whether `node` is the field or lies in it. */
  contains(node: EventTarget | null): boolean {
    return node !== null && this.root.contains(node as Node);
  }

  /** Gives the field the keyboard; `all` selects its words, else the caret stands at their end. */
  focus(all = false): void {
    this.input.focus({ preventScroll: true });
    if (all) this.input.select();
    else this.input.setSelectionRange(this.input.value.length, this.input.value.length);
  }

  /** Gives the field the keyboard back, its caret and selection as they were. */
  refocus(): void {
    this.input.focus({ preventScroll: true });
  }

  /** Sets the field's look and size. */
  show(look: FieldLook): void {
    const room = Math.max(4, CARET_ROOM * look.lineHeight);
    const px = (value: number): string => `${value}px`;
    this.root.toggleClass('atlas-map-text-field--wraps', look.wraps);
    this.root.toggleClass('atlas-map-text-field--plate', look.plate !== null);
    const face = { '--atlas-text-field-font': look.font, '--atlas-text-field-line': px(look.lineHeight) };
    this.probe.setCssProps(face);
    this.root.setCssProps({
      ...face,
      '--atlas-text-field-color': look.color,
      '--atlas-text-field-align': look.align,
      '--atlas-text-field-width': px(look.width),
      '--atlas-text-field-height': px(look.height),
      '--atlas-text-field-room': px(room),
      '--atlas-text-field-shift': px(look.ascent - this.baseline(look)),
      '--atlas-text-field-halo': look.halo ? `${px(look.halo.width)} ${rgba(look.halo.color, look.halo.alpha)}` : '0 transparent',
      '--atlas-text-field-plate': look.plate ? rgba(look.plate.color, look.plate.opacity) : 'transparent',
      '--atlas-text-field-plate-reach': px(look.plate?.reach ?? 0),
      '--atlas-text-field-plate-radius': px(look.plate?.radius ?? 0),
    });
    // Should the browser ever break a line where the map's rule does not, the field grows: it never scrolls its words away.
    const over = this.input.scrollHeight - this.input.clientHeight;
    if (over > 0) this.root.setCssProps({ '--atlas-text-field-height': px(this.input.scrollHeight) });
    this.input.scrollTop = 0;
    this.input.scrollLeft = 0;
  }

  /** Lays the field where `place` maps it; nothing where it lies so already. */
  place(place: FieldPlace): void {
    const matrix = `matrix(${place.a}, ${place.b}, ${place.c}, ${place.d}, ${place.tx}, ${place.ty})`;
    if (matrix === this.placed) return;
    this.placed = matrix;
    this.root.setCssProps({ '--atlas-text-field-transform': matrix });
  }

  destroy(): void {
    this.root.remove();
    this.probe.remove();
  }

  /** From a line's top to the line its letters stand on, as the browser sets a line of this face and height. */
  private baseline(look: FieldLook): number {
    const key = `${look.font}|${look.lineHeight}`;
    if (key !== this.measured.key) {
      this.measured = { key, baseline: this.mark.getBoundingClientRect().bottom - this.probe.getBoundingClientRect().top };
    }
    return this.measured.baseline;
  }
}
