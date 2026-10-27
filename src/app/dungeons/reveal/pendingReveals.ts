import type { RevealPlan } from './revealPlan';

export const PENDING_REVEALS_KEY = 'atlas-vtt:dungeon-reveals';
/** Scenes made and never opened on this device are forgotten past this many, oldest first. */
const MAX_PENDING = 20;

interface LocalStorage {
  loadLocalStorage(key: string): unknown;
  saveLocalStorage(key: string, data: unknown): void;
}

/** How a new dungeon scene grows into being the first time it is shown, per level. */
export interface PendingReveal {
  /** The map image's size the plans are drawn for, in pixels. */
  width: number;
  height: number;
  /** Each level's plan by its id; a scene without levels has one, under `SINGLE_LEVEL`. */
  levels: Record<string, RevealPlan>;
}

/** The key of the one plan of a scene without levels. */
export const SINGLE_LEVEL = '';

type Pending = Record<string, PendingReveal>;

function read(storage: LocalStorage): Pending {
  const stored = storage.loadLocalStorage(PENDING_REVEALS_KEY);
  return stored && typeof stored === 'object' ? (stored as Pending) : {};
}

/**
 * Notes that the scene at `scenePath` grows into being the first time this device shows it. A
 * device fact (which scenes this device made and has yet to show), so it lives in the vault's
 * local storage; a scene renamed before it was opened just opens as it is.
 */
export function holdReveal(storage: LocalStorage, scenePath: string, reveal: PendingReveal): void {
  const pending = { ...read(storage), [scenePath]: reveal };
  const paths = Object.keys(pending);
  for (const old of paths.slice(0, Math.max(0, paths.length - MAX_PENDING))) delete pending[old];
  storage.saveLocalStorage(PENDING_REVEALS_KEY, pending);
}

/** The plan the scene at `scenePath` grows by on `level`, once: taking it forgets the scene's. */
export function takeReveal(storage: LocalStorage, scenePath: string, level: string | null): { plan: RevealPlan; width: number; height: number } | null {
  const pending = read(storage);
  const reveal = pending[scenePath];
  if (!reveal) return null;
  delete pending[scenePath];
  storage.saveLocalStorage(PENDING_REVEALS_KEY, pending);
  const plan = reveal.levels?.[level ?? SINGLE_LEVEL];
  return plan && reveal.width > 0 && reveal.height > 0 ? { plan, width: reveal.width, height: reveal.height } : null;
}
