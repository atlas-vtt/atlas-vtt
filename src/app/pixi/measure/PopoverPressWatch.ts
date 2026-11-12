/**
 * Hears every press in the document a popover is open in, in the capture phase, for as long as it
 * is open: a press outside it closes it wherever it lands, and the press still does what it does
 * there. One document at a time: a map in a popout has its own.
 */
export class PopoverPressWatch {
  private doc: Document | null = null;

  constructor(private readonly onPress: (event: PointerEvent) => void) {}

  /** Listens in `doc`; in none once the popover has closed (null). */
  hear(doc: Document | null): void {
    if (doc === this.doc) return;
    this.doc?.removeEventListener('pointerdown', this.onPress, true);
    this.doc = doc;
    doc?.addEventListener('pointerdown', this.onPress, true);
  }
}
