export const LIGHTING_ATTEMPTS_KEY = 'atlas-vtt:lighting-attempts';

/** One view's attempts to light its map with the GPU engine. */
export interface LightingAttempt {
  /** Notes that lighting the map starts now. False when an earlier start on it never finished: do not start. */
  begin(): boolean;
  /** The engine drew the map, or the attempt was called off in an orderly way: the note goes. */
  finish(): void;
}

/** The vault's device-local storage, as Obsidian's `App` offers it. */
interface LocalStorage {
  loadLocalStorage(key: string): unknown;
  saveLocalStorage(key: string, data: unknown): void;
}

/**
 * How many views of this session are attempting each map now: a note on such a map is not left
 * over from a crash, and it stays until the last of them is done.
 */
const running = new Map<string, number>();

/**
 * The crash-loop breaker of dynamic lighting. A graphics process that dies while the engine
 * builds a map takes Atlas' error handling with it, and the map would crash again on every
 * open. So the map's path is noted before the first build and the note removed after the first
 * lit frame; a note found at the next start means that attempt never finished.
 *
 * Notes live in the vault's local storage: they describe this device's graphics, and never
 * sync to another one.
 */
export class StoredLightingAttempt implements LightingAttempt {
  private open: string | null = null;

  constructor(private readonly storage: LocalStorage, private readonly mapPath: () => string | null) {}

  begin(): boolean {
    const path = this.mapPath();
    if (!path) return true;
    if (this.open === path) {
      // This view's own attempt, begun again: a lost WebGL context cut it short. It no longer
      // runs, and its note stays for every later start, in this session too.
      this.stopRunning();
      return false;
    }
    const noted = this.read();
    if (noted.includes(path) && !running.has(path)) return false;
    this.finish();
    this.open = path;
    running.set(path, (running.get(path) ?? 0) + 1);
    if (!noted.includes(path)) this.write([...noted, path]);
    return true;
  }

  finish(): void {
    const path = this.stopRunning();
    if (path && !running.has(path)) this.erase(path);
  }

  /**
   * The GM asks for another attempt on the view's map: its note goes, whoever left it, unless
   * another view is attempting the map right now (that view's finish removes it).
   */
  forget(): void {
    const path = this.stopRunning() ?? this.mapPath();
    if (path && !running.has(path)) this.erase(path);
  }

  /** Ends this view's part in the attempt it has open and returns that map's path. */
  private stopRunning(): string | null {
    const path = this.open;
    if (!path) return null;
    this.open = null;
    const others = (running.get(path) ?? 1) - 1;
    if (others > 0) running.set(path, others);
    else running.delete(path);
    return path;
  }

  private erase(path: string): void {
    const noted = this.read();
    if (noted.includes(path)) this.write(noted.filter((other) => other !== path));
  }

  private read(): string[] {
    try {
      const stored: unknown = this.storage.loadLocalStorage(LIGHTING_ATTEMPTS_KEY);
      return Array.isArray(stored) ? stored.filter((path): path is string => typeof path === 'string') : [];
    } catch (error) {
      console.error('[Atlas] Could not read the lighting attempts', error);
      return [];
    }
  }

  private write(paths: string[]): void {
    try {
      this.storage.saveLocalStorage(LIGHTING_ATTEMPTS_KEY, paths.length > 0 ? paths : null);
    } catch (error) {
      console.error('[Atlas] Could not save the lighting attempts', error);
    }
  }
}
