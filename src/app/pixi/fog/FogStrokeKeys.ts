import { isTextEntryTarget } from '../../keyboard/textEntry';

/** What a fog stroke under way does with its keys. */
export interface FogStrokeKeyHost {
  /** Alt went down or up: the stroke does the other of hiding and revealing while it is held. */
  flipped(held: boolean): void;
  /** Escape, or the window lost focus: the stroke is dropped. */
  dropped(): void;
}

/**
 * The keys of a fog stroke, heard only while one is under way (`hold` to `release`): in the
 * capture phase on the canvas's own window, as a measurement's are, so Escape drops the stroke
 * and never reaches the map's shortcuts, which would also clear the selection.
 */
export class FogStrokeKeys {
  /** Stops listening; null while no stroke is under way. */
  private letGo: (() => void) | null = null;

  constructor(
    private readonly canvas: () => HTMLElement,
    private readonly host: FogStrokeKeyHost,
  ) {}

  hold(): void {
    if (this.letGo) return;
    const win = this.canvas().ownerDocument.defaultView;
    if (!win) return;
    win.addEventListener('keydown', this.onKeyDown, true);
    win.addEventListener('keyup', this.onKeyUp, true);
    win.addEventListener('blur', this.onBlur);
    this.letGo = (): void => {
      win.removeEventListener('keydown', this.onKeyDown, true);
      win.removeEventListener('keyup', this.onKeyUp, true);
      win.removeEventListener('blur', this.onBlur);
    };
  }

  release(): void {
    this.letGo?.();
    this.letGo = null;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // A key typed into a field is that field's.
    if (isTextEntryTarget(event.target)) return;
    if (event.key === 'Alt') {
      this.host.flipped(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.host.dropped();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Alt') this.host.flipped(false);
  };

  /** A window that lost focus hears no key up and may get no release: the stroke would stay open. */
  private readonly onBlur = (): void => this.host.dropped();
}
