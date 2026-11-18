import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_BUDGETS, MOBILE_BUDGETS, budgetsFor, imageWorkerCount } from '../../../src/app/platform/deviceBudgets';
import { COARSE_POINTER_SCALE, createDeviceProfile, mediaPointerSource, pointerKindOf, type PointerSource } from '../../../src/app/platform/deviceProfile';
import { WARM_STAGES } from '../../../src/app/dice3d/stagePool';
import { DEFAULT_LIGHTING_QUALITY, LIGHTING_QUALITY } from '../../../src/app/lighting/lightingQuality';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

/** A pointer whose answers a test changes, telling its listeners. */
function pointers(start: { coarse: boolean | null; mouse: boolean }): PointerSource & { set(next: { coarse: boolean | null; mouse: boolean }): void; listeners: Set<() => void> } {
  let now = start;
  const listeners = new Set<() => void>();
  return {
    coarse: () => now.coarse,
    mouse: () => now.mouse,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      now = next;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

const MOUSE = { coarse: false, mouse: true };
const FINGER = { coarse: true, mouse: false };

describe('the budgets of a desktop', () => {
  it('are what Atlas always used', () => {
    expect(DESKTOP_BUDGETS).toEqual({
      imageWorkers: 6,
      imageWorkerBudget: GIB,
      decodedLevelsBudget: GIB,
      tileCacheMax: 4 * GIB,
      tileCacheQuotaShare: 0.1,
      tileTextureBudget: 160 * MIB,
      lightingQualityDefault: 'high',
      diceWarmStages: 4,
      diceShadowMap: 1024,
      imageSourceBytes: Infinity,
      uvttFileBytes: 150 * MIB,
      uvttFloorsBytes: 400 * MIB,
      generatedMapPixels: Infinity,
      generatedMapSide: Infinity,
      videoMapBytes: 500 * MIB,
      fogCanvasSide: Infinity,
    });
  });

  it('agree with the dice stages and the lighting quality the shared code starts from', () => {
    expect(DESKTOP_BUDGETS.diceWarmStages).toBe(WARM_STAGES);
    expect(LIGHTING_QUALITY[DESKTOP_BUDGETS.lightingQualityDefault]).toBe(DEFAULT_LIGHTING_QUALITY);
  });

  it.each([[1, 1], [2, 1], [4, 3], [7, 6], [8, 6], [32, 6]])('with %i cores run %i image workers: one core stays free, six at most', (cores, workers) => {
    expect(imageWorkerCount(DESKTOP_BUDGETS, cores)).toBe(workers);
  });
});

describe('the budgets of a tablet', () => {
  it('stay well under a web view\'s memory', () => {
    expect(MOBILE_BUDGETS).toEqual({
      imageWorkers: 2,
      imageWorkerBudget: 256 * MIB,
      decodedLevelsBudget: 256 * MIB,
      tileCacheMax: 512 * MIB,
      tileCacheQuotaShare: 0.05,
      tileTextureBudget: 96 * MIB,
      lightingQualityDefault: 'balanced',
      diceWarmStages: 1,
      diceShadowMap: 512,
      imageSourceBytes: 256 * MIB,
      uvttFileBytes: 64 * MIB,
      uvttFloorsBytes: 128 * MIB,
      generatedMapPixels: 4096 * 4096,
      generatedMapSide: 8192,
      videoMapBytes: 128 * MIB,
      fogCanvasSide: 3072,
    });
  });

  it.each([[1, 1], [2, 1], [3, 2], [8, 2]])('with %i cores run %i image workers', (cores, workers) => {
    expect(imageWorkerCount(MOBILE_BUDGETS, cores)).toBe(workers);
  });
});

describe('the device profile', () => {
  it('gives the desktop app its own budgets and a fine pointer', () => {
    const profile = createDeviceProfile({ isMobile: false, isPhone: false }, pointers(MOUSE));
    expect(profile).toMatchObject({ isMobileApp: false, isPhone: false, memoryClass: 'desktop', pointer: 'fine' });
    expect(profile.budgets).toBe(DESKTOP_BUDGETS);
    expect(profile.budgets).toBe(budgetsFor('desktop'));
    expect(profile.pointerScale()).toBe(1);
  });

  it('gives a tablet the mobile budgets and a coarse pointer', () => {
    const profile = createDeviceProfile({ isMobile: true, isPhone: false }, pointers(FINGER));
    expect(profile).toMatchObject({ isMobileApp: true, isPhone: false, memoryClass: 'mobile', pointer: 'coarse' });
    expect(profile.budgets).toBe(MOBILE_BUDGETS);
    expect(profile.pointerScale()).toBe(COARSE_POINTER_SCALE);
  });

  it('says a phone is one', () => {
    expect(createDeviceProfile({ isMobile: true, isPhone: true }, pointers(FINGER)).isPhone).toBe(true);
  });

  it('follows a mouse attached to a tablet and taken away again, and tells only real changes', () => {
    const source = pointers(FINGER);
    const profile = createDeviceProfile({ isMobile: true, isPhone: false }, source);
    const heard = vi.fn();
    const stop = profile.onPointerChange(heard);

    source.set(MOUSE);
    expect(profile.pointer).toBe('fine');
    expect(profile.pointerScale()).toBe(1);
    source.set(MOUSE);
    source.set(FINGER);
    expect(profile.pointer).toBe('coarse');
    expect(heard.mock.calls).toEqual([['fine'], ['coarse']]);

    stop();
    source.set(MOUSE);
    expect(heard).toHaveBeenCalledTimes(2);
    expect(source.listeners.size).toBe(0);
  });

  it('keeps the memory class of its start whatever the pointer does', () => {
    const source = pointers(FINGER);
    const profile = createDeviceProfile({ isMobile: true, isPhone: false }, source);
    source.set(MOUSE);
    expect(profile.memoryClass).toBe('mobile');
    expect(profile.budgets).toBe(MOBILE_BUDGETS);
  });
});

describe('the kind of pointer', () => {
  it.each([
    ['a desktop with a mouse', false, false, true, 'fine'],
    ['a desktop whose primary pointer is a touch screen', false, true, false, 'coarse'],
    ['a desktop that cannot be asked', false, null, false, 'fine'],
    ['a tablet', true, true, false, 'coarse'],
    ['a tablet that cannot be asked', true, null, false, 'coarse'],
    ['a tablet whose primary pointer is a pen, which does not hover', true, false, false, 'coarse'],
    ['a tablet with a mouse attached', true, false, true, 'fine'],
  ] as const)('%s', (_name, isMobile, coarse, mouse, kind) => {
    expect(pointerKindOf(isMobile, coarse, mouse)).toBe(kind);
  });
});

describe('the pointer as media queries tell it', () => {
  it('cannot be asked in a window without them', () => {
    expect(mediaPointerSource(undefined).coarse()).toBeNull();
    const source = mediaPointerSource({} as Pick<Window, 'matchMedia'>);
    expect(source.coarse()).toBeNull();
    expect(source.mouse()).toBe(false);
    expect(source.onChange(() => undefined)).toBeTypeOf('function');
  });

  it('asks for a coarse pointer and for a mouse, and hears either change until told to stop', () => {
    const queries = new Map<string, { matches: boolean; listeners: Set<() => void> }>();
    const matchMedia = (query: string): MediaQueryList => {
      const state = { matches: query === '(pointer: coarse)', listeners: new Set<() => void>() };
      queries.set(query, state);
      return {
        get matches() { return state.matches; },
        addEventListener: (_type: string, listener: () => void) => state.listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => state.listeners.delete(listener),
      } as unknown as MediaQueryList;
    };
    const source = mediaPointerSource({ matchMedia });
    expect([...queries.keys()]).toEqual(['(pointer: coarse)', '(pointer: fine) and (hover: hover)']);
    expect(source.coarse()).toBe(true);
    expect(source.mouse()).toBe(false);

    const heard = vi.fn();
    const stop = source.onChange(heard);
    for (const { listeners } of queries.values()) for (const listener of listeners) listener();
    expect(heard).toHaveBeenCalledTimes(2);
    stop();
    expect([...queries.values()].every(({ listeners }) => listeners.size === 0)).toBe(true);
  });
});
