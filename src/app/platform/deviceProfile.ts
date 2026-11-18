import { Platform } from 'obsidian';
import { FINGER_REACH_SCALE } from '../pixi/utils/pointerReach';
import { budgetsFor, type DeviceBudgets, type MemoryClass } from './deviceBudgets';

export type PointerKind = 'fine' | 'coarse';

/** What Obsidian says about the device; read once, when the profile is made. */
export interface DeviceFacts {
  /** Obsidian's UI is in mobile mode: the mobile app, or the desktop app emulating it (`app.emulateMobile`). */
  readonly isMobile: boolean;
  /** A mobile app with very limited screen space, where Atlas shows only a notice. */
  readonly isPhone: boolean;
}

/** What the device says about its pointer; asked each time, since a mouse may be attached or taken away. */
export interface PointerSource {
  /** Whether the primary pointer is coarse (`(pointer: coarse)`); null where the device cannot be asked. */
  coarse(): boolean | null;
  /** Whether the primary pointer is a mouse or trackpad: fine, and it hovers. */
  mouse(): boolean;
  /** Tells when an answer may have changed; returns the unsubscribe function. */
  onChange(listener: () => void): () => void;
}

/** One answer per app start for how Atlas sizes itself to the device: its pointer, and what it may hold at once. */
export interface DeviceProfile {
  readonly isMobileApp: boolean;
  readonly isPhone: boolean;
  readonly memoryClass: MemoryClass;
  readonly budgets: DeviceBudgets;
  /** The pointer now. */
  readonly pointer: PointerKind;
  /** What canvas hit areas and drag thresholds sized for a mouse are multiplied by. */
  pointerScale(): number;
  /** Hears the pointer once it changed; returns the unsubscribe function. */
  onPointerChange(listener: (pointer: PointerKind) => void): () => void;
}

/**
 * A finger needs a target 44 points across (Apple's guidelines), where Atlas' handles on the map
 * are about 22 px for a mouse (resize handles 20, a light ring's handle 2 × 11).
 */
export const COARSE_POINTER_SCALE = FINGER_REACH_SCALE;

/**
 * A coarse primary pointer is a finger. On a mobile device a fine one counts only where it hovers
 * (a mouse or trackpad): a pen as the primary pointer still shares the screen with fingers.
 */
export function pointerKindOf(isMobile: boolean, coarse: boolean | null, mouse: boolean): PointerKind {
  if (coarse === true) return 'coarse';
  return isMobile && !mouse ? 'coarse' : 'fine';
}

export function createDeviceProfile(facts: DeviceFacts, pointers: PointerSource): DeviceProfile {
  const memoryClass: MemoryClass = facts.isMobile ? 'mobile' : 'desktop';
  const pointer = (): PointerKind => pointerKindOf(facts.isMobile, pointers.coarse(), pointers.mouse());
  return {
    isMobileApp: facts.isMobile,
    isPhone: facts.isPhone,
    memoryClass,
    budgets: budgetsFor(memoryClass),
    get pointer(): PointerKind {
      return pointer();
    },
    pointerScale: () => (pointer() === 'coarse' ? COARSE_POINTER_SCALE : 1),
    onPointerChange: (listener) => {
      let last = pointer();
      return pointers.onChange(() => {
        const next = pointer();
        if (next === last) return;
        last = next;
        listener(next);
      });
    },
  };
}

const COARSE_QUERY = '(pointer: coarse)';
const MOUSE_QUERY = '(pointer: fine) and (hover: hover)';

/** The pointer as `win`'s media queries tell it; where there is no window, or one without them (a test's), it cannot be asked. */
export function mediaPointerSource(win: Pick<Window, 'matchMedia'> | undefined): PointerSource {
  if (typeof win?.matchMedia !== 'function') return { coarse: () => null, mouse: () => false, onChange: () => () => undefined };
  const coarse = win.matchMedia(COARSE_QUERY);
  const mouse = win.matchMedia(MOUSE_QUERY);
  return {
    coarse: () => coarse.matches,
    mouse: () => mouse.matches,
    onChange: (listener) => {
      coarse.addEventListener('change', listener);
      mouse.addEventListener('change', listener);
      return () => {
        coarse.removeEventListener('change', listener);
        mouse.removeEventListener('change', listener);
      };
    },
  };
}

let current: DeviceProfile | null = null;

/** This device's profile, made the first time it is asked for. */
export function deviceProfile(): DeviceProfile {
  // The main window answers for all: every window of the app has the same pointers
  current ??= createDeviceProfile({ isMobile: Platform.isMobile, isPhone: Platform.isPhone }, mediaPointerSource(typeof window === 'undefined' ? undefined : window));
  return current;
}
