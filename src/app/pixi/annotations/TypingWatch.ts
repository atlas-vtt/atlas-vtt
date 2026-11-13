import { isTextEntryTarget } from '../../keyboard/textEntry';

/** What the watch asks of the field a text is typed in. */
export interface WatchedField {
  readonly focused: boolean;
  contains(node: EventTarget | null): boolean;
  refocus(): void;
}

/** The Draw tool's own bars: a press there changes the text being typed and leaves the keyboard with it. */
const BARS = '.atlas-bottom-toolbar-row__options';

function within(target: EventTarget | null, selector: string): boolean {
  const node = target as Node | null;
  return node !== null && typeof node.instanceOf === 'function' && node.instanceOf(Element) && node.closest(selector) !== null;
}

/**
 * What ends the typing of a text from outside its field, and what keeps the keyboard with it,
 * heard in the canvas's own document and window while a field shows:
 *
 * - a press anywhere but in the field and the tool's bars finishes the text, in the capture phase,
 *   so the press then does what it does where it landed, on a map that already has the text;
 * - a press on the bars' buttons does not take the keyboard (its default is prevented; the click
 *   still comes), so a pick restyles the text and the next key is typed into it;
 * - the window closing finishes the text;
 * - a field that lost the keyboard all the same (a menu that closed, the canvas pressed as the
 *   field opened) gets it back, unless another text field has it: then the text is done.
 */
export class TypingWatch {
  private field: WatchedField | null = null;

  constructor(private readonly canvas: () => HTMLElement, private readonly finish: () => void) {}

  start(field: WatchedField): void {
    this.stop();
    this.field = field;
    const doc = this.canvas().ownerDocument;
    doc.addEventListener('pointerdown', this.onPress, true);
    doc.addEventListener('mousedown', this.onMouseDown, true);
    doc.defaultView?.addEventListener('pagehide', this.finish);
    doc.defaultView?.addEventListener('beforeunload', this.finish);
  }

  stop(): void {
    if (!this.field) return;
    this.field = null;
    const doc = this.canvas().ownerDocument;
    doc.removeEventListener('pointerdown', this.onPress, true);
    doc.removeEventListener('mousedown', this.onMouseDown, true);
    doc.defaultView?.removeEventListener('pagehide', this.finish);
    doc.defaultView?.removeEventListener('beforeunload', this.finish);
  }

  /** The field lost the keyboard: looked at once whatever took it has it. */
  blurred(): void {
    const doc = this.canvas().ownerDocument;
    doc.defaultView?.setTimeout(() => {
      const field = this.field;
      if (!field || field.focused) return;
      if (isTextEntryTarget(doc.activeElement)) this.finish();
      else field.refocus();
    }, 0);
  }

  private readonly onPress = (event: PointerEvent): void => {
    if (this.field && !this.field.contains(event.target) && !within(event.target, BARS)) this.finish();
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (this.field && within(event.target, BARS) && !isTextEntryTarget(event.target)) event.preventDefault();
  };
}
