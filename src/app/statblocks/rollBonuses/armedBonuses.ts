/**
 * Which values a GM armed for a statblock's next roll ("Add to next roll"): view
 * state of the app, never written to the note, the map, the settings or the
 * history, and gone with a reload. One list per statblock, by its key (the
 * note's path, `statblockBonusKey`), so every view of the note (the panel
 * beside it, the hover preview, the preview window, the DM screen) shows the
 * same switches. Only ids are kept: what a value adds is read from the card
 * when the roll is made. Pure: no Obsidian, no React.
 */

/** One armed value as a roll adds it: its id, its label and its number, as the card shows them now. */
export interface ArmedBonus {
  /** The value's identity in its statblock (`bonusId`): the same value shown twice is armed once. */
  id: string;
  /** The bonus's name in the roll: the field's label ("Proficiency"), a pair's name ("Stealth"). */
  label: string;
  value: number;
}

/** Set by the card on a value that adds to rolls, around its number and its switch: its id (`bonusId`). */
export const BONUS_ID_ATTRIBUTE = 'data-bonus-id';

type Listener = () => void;

const NONE: readonly string[] = Object.freeze([]);

/** The armed values of every statblock of one app. */
export class ArmedBonuses {
  private static readonly byApp = new WeakMap<object, ArmedBonuses>();

  /** The one store of `app`, made when first asked for. */
  static forApp(app: object): ArmedBonuses {
    let store = ArmedBonuses.byApp.get(app);
    if (!store) {
      store = new ArmedBonuses();
      ArmedBonuses.byApp.set(app, store);
    }
    return store;
  }

  /** Per statblock key, the ids armed in the order they were armed; each list is replaced, never changed. */
  private readonly armedBy = new Map<string, readonly string[]>();
  private readonly listenersBy = new Map<string, Set<Listener>>();

  /** The ids armed for `key`, in the order they were armed; the same array while they are unchanged. */
  armed(key: string): readonly string[] {
    return this.armedBy.get(key) ?? NONE;
  }

  isArmed(key: string, id: string): boolean {
    return this.armed(key).includes(id);
  }

  /** Arms a value, or disarms it where it is armed. */
  toggle(key: string, id: string): void {
    const armed = this.armed(key);
    this.set(key, armed.includes(id) ? armed.filter((entry) => entry !== id) : [...armed, id]);
  }

  /** Disarms the values a roll took. */
  spend(key: string, ids: readonly string[]): void {
    const armed = this.armed(key);
    const left = armed.filter((id) => !ids.includes(id));
    if (left.length !== armed.length) this.set(key, left);
  }

  /** Calls `listener` after every change of `key`'s values; returns what stops it. */
  subscribe(key: string, listener: Listener): () => void {
    let listeners = this.listenersBy.get(key);
    if (!listeners) {
      listeners = new Set();
      this.listenersBy.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listenersBy.delete(key);
    };
  }

  private set(key: string, armed: readonly string[]): void {
    if (armed.length === 0) this.armedBy.delete(key);
    else this.armedBy.set(key, Object.freeze(armed));
    for (const listener of [...(this.listenersBy.get(key) ?? [])]) listener();
  }
}
