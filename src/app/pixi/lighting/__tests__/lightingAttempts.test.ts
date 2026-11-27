import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIGHTING_ATTEMPTS_KEY, StoredLightingAttempt } from '../lightingAttempts';

/** The vault's local storage of one device. */
function deviceStorage(initial: unknown = null): { loadLocalStorage: (key: string) => unknown; saveLocalStorage: (key: string, data: unknown) => void; stored: () => unknown } {
  const values = new Map<string, unknown>([[LIGHTING_ATTEMPTS_KEY, initial]]);
  return {
    loadLocalStorage: (key) => values.get(key) ?? null,
    saveLocalStorage: (key, data) => void values.set(key, data),
    stored: () => values.get(LIGHTING_ATTEMPTS_KEY) ?? null,
  };
}

describe('StoredLightingAttempt', () => {
  const open: StoredLightingAttempt[] = [];
  afterEach(() => {
    while (open.length) open.pop()!.forget();
    vi.restoreAllMocks();
  });

  function attemptOn(storage: ReturnType<typeof deviceStorage>, path: string | null = 'maps/cave.atlasmap'): StoredLightingAttempt {
    const attempt = new StoredLightingAttempt(storage, () => path);
    open.push(attempt);
    return attempt;
  }

  it('notes the map before the build and removes the note once a frame was drawn', () => {
    const storage = deviceStorage();
    const attempt = attemptOn(storage);
    expect(attempt.begin()).toBe(true);
    expect(storage.stored()).toEqual(['maps/cave.atlasmap']);
    attempt.finish();
    expect(storage.stored()).toBeNull();
    expect(attempt.begin()).toBe(true);
  });

  it('refuses a map whose note an earlier session left behind, until it is forgotten', () => {
    const storage = deviceStorage(['maps/cave.atlasmap']);
    const attempt = attemptOn(storage);
    expect(attempt.begin()).toBe(false);
    expect(storage.stored()).toEqual(['maps/cave.atlasmap']);

    attempt.forget();
    expect(storage.stored()).toBeNull();
    expect(attempt.begin()).toBe(true);
  });

  it('begins its own attempt again once after a lost context cut it short, and each attempt has that once', () => {
    const storage = deviceStorage();
    const attempt = attemptOn(storage);
    expect(attempt.begin()).toBe(true);
    expect(attempt.begin()).toBe(true);
    expect(storage.stored()).toEqual(['maps/cave.atlasmap']);
    attempt.finish();
    expect(storage.stored()).toBeNull();

    expect(attempt.begin()).toBe(true);
    expect(attempt.begin()).toBe(true);
  });

  it('refuses its own attempt cut short a second time, as when the graphics process dies at every start', () => {
    const storage = deviceStorage();
    const attempt = attemptOn(storage);
    attempt.begin();
    attempt.begin();
    expect(attempt.begin()).toBe(false);
    expect(storage.stored()).toEqual(['maps/cave.atlasmap']);
  });

  it('keeps refusing a map whose attempt was cut short twice, in this session and from any view', () => {
    const storage = deviceStorage();
    const attempt = attemptOn(storage);
    attempt.begin();
    attempt.begin();
    attempt.begin();

    expect(attempt.begin()).toBe(false);
    expect(attemptOn(storage).begin()).toBe(false);
    attempt.finish();
    expect(storage.stored()).toEqual(['maps/cave.atlasmap']);

    attempt.forget();
    expect(storage.stored()).toBeNull();
    expect(attempt.begin()).toBe(true);
  });

  it('keeps the notes of other maps', () => {
    const storage = deviceStorage(['maps/crypt.atlasmap']);
    const attempt = attemptOn(storage);
    expect(attempt.begin()).toBe(true);
    expect(storage.stored()).toEqual(['maps/crypt.atlasmap', 'maps/cave.atlasmap']);
    attempt.finish();
    expect(storage.stored()).toEqual(['maps/crypt.atlasmap']);
  });

  it('does not take the running attempt of another view of the same map for a crash', () => {
    const storage = deviceStorage();
    const first = attemptOn(storage);
    const second = attemptOn(storage);
    expect(first.begin()).toBe(true);
    expect(second.begin()).toBe(true);
  });

  it('keeps the note of a map until the last view attempting it is done', () => {
    const storage = deviceStorage();
    const first = attemptOn(storage);
    const second = attemptOn(storage);
    first.begin();
    second.begin();

    first.finish();
    expect(storage.stored()).toEqual(['maps/cave.atlasmap']);
    second.finish();
    expect(storage.stored()).toBeNull();
  });

  it('leaves the note to a view still attempting the map when another one forgets it', () => {
    const storage = deviceStorage();
    const first = attemptOn(storage);
    const second = attemptOn(storage);
    first.begin();
    second.begin();

    first.forget();
    expect(storage.stored()).toEqual(['maps/cave.atlasmap']);
    expect(first.begin()).toBe(true);
    first.finish();
    second.finish();
    expect(storage.stored()).toBeNull();
  });

  it('finishes the note of the map it began on, even after the view moved to another', () => {
    const storage = deviceStorage();
    let path = 'maps/cave.atlasmap';
    const attempt = new StoredLightingAttempt(storage, () => path);
    open.push(attempt);
    attempt.begin();
    path = 'maps/crypt.atlasmap';
    attempt.finish();
    expect(storage.stored()).toBeNull();
  });

  it('attempts a view without a map file, and notes nothing', () => {
    const storage = deviceStorage();
    expect(attemptOn(storage, null).begin()).toBe(true);
    expect(storage.stored()).toBeNull();
  });

  it('attempts when the stored value is not a list of paths or the storage fails', () => {
    expect(attemptOn(deviceStorage({ 'maps/cave.atlasmap': true })).begin()).toBe(true);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = deviceStorage();
    broken.loadLocalStorage = (): unknown => {
      throw new Error('storage is unavailable');
    };
    broken.saveLocalStorage = (): void => {
      throw new Error('storage is unavailable');
    };
    expect(attemptOn(broken, 'maps/vault.atlasmap').begin()).toBe(true);
    expect(error).toHaveBeenCalled();
  });
});
