import { isTextEntryTarget } from '../../keyboard/textEntry';

/** What the selected fog area does with its keys. */
export interface FogAreaKeyHost {
  /** Whether a key is the selection's to take now: the map's own, and no stroke under way that has keys of its own. */
  mayTake(event: KeyboardEvent): boolean;
  /** Delete or Backspace: the area is deleted. */
  deleted(): void;
  /** Escape: a drag under way is put back, else the area is deselected. */
  escaped(): void;
  /** The window lost focus: a drag under way would get no release. */
  blurred(): void;
}

/**
 * The keys of the fog area selected in Areas mode, heard only while one is (`hold` to `release`):
 * in the capture phase on the canvas's own window, as a stroke's are (`FogStrokeKeys`), so Delete
 * deletes the area and never reaches the map's shortcuts, which would delete the map's selection.
 */
export class FogAreaKeys {
  /** Stops listening; null while no area is selected. */
  private letGo: (() => void) | null = null;

  constructor(
    private readonly canvas: () => HTMLElement,
    private readonly host: FogAreaKeyHost,
  ) {}

  hold(): void {
    if (this.letGo) return;
    const win = this.canvas().ownerDocument.defaultView;
    if (!win) return;
    win.addEventListener('keydown', this.onKeyDown, true);
    win.addEventListener('blur', this.onBlur);
    this.letGo = (): void => {
      win.removeEventListener('keydown', this.onKeyDown, true);
      win.removeEventListener('blur', this.onBlur);
    };
  }

  release(): void {
    this.letGo?.();
    this.letGo = null;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // A key typed into a field is that field's; one that is not the map's is left to whoever it belongs to.
    if (isTextEntryTarget(event.target) || !this.host.mayTake(event)) return;
    const { key } = event;
    if (key !== 'Delete' && key !== 'Backspace' && key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    // A key held down repeats: it is still the selection's, and acts once.
    if (event.repeat) return;
    if (key === 'Escape') this.host.escaped();
    else this.host.deleted();
  };

  private readonly onBlur = (): void => this.host.blurred();
}
