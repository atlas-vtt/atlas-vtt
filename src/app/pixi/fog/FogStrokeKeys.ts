import { isTextEntryTarget } from '../../keyboard/textEntry';
import { placeKeysOf, type PlaceKeys } from './FogSnapping';

/** What a fog stroke under way does with its keys. */
export interface FogStrokeKeyHost {
  /** Alt went down or up: the stroke does the other of hiding and revealing while it is held. */
  flipped(held: boolean): void;
  /** Escape, or the window lost focus: the stroke is dropped. */
  dropped(): void;
  /**
   * Enter or Backspace: a polygon closes, or gives its last corner back. True where what is under
   * way took the key, which the map's shortcuts then never hear. A key held down repeats
   * (`repeat`): it is still the stroke's, and acts once.
   */
  edited?(key: 'Enter' | 'Backspace', repeat: boolean): boolean;
  /**
   * Whether a key is the map's undo. What is under way takes it as it takes Backspace: a polygon
   * gives its last corner back, and the map's undo never hears the key then.
   */
  undoes?(event: KeyboardEvent): boolean;
  /** Shift, Ctrl or Cmd went down or up: a point lands as the keys now say. */
  rekeyed?(keys: PlaceKeys): void;
  /**
   * Whether a key is this map's to take. One that is not (a dialog or a menu is open over the
   * map, another tab is in front) drops what is under way and is left to whoever it belongs to.
   */
  areMaps?(event: KeyboardEvent): boolean;
}

const MODIFIERS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Meta']);

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
    if (this.host.areMaps?.(event) === false) {
      this.host.dropped();
      return;
    }
    const { key } = event;
    if (key === 'Alt') {
      this.host.flipped(true);
    } else if (key === 'Escape') {
      this.take(event);
      this.host.dropped();
    } else if (key === 'Enter' || key === 'Backspace') {
      if (this.host.edited?.(key, event.repeat)) this.take(event);
    } else if (this.host.undoes?.(event)) {
      if (this.host.edited?.('Backspace', event.repeat)) this.take(event);
    } else if (MODIFIERS.has(key)) {
      this.host.rekeyed?.(placeKeysOf(event));
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Alt') this.host.flipped(false);
    else if (MODIFIERS.has(event.key)) this.host.rekeyed?.(placeKeysOf(event));
  };

  /** A window that lost focus hears no key up and may get no release: the stroke would stay open. */
  private readonly onBlur = (): void => this.host.dropped();

  /** The key is the stroke's: neither the browser nor the map's shortcuts act on it. */
  private take(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }
}
