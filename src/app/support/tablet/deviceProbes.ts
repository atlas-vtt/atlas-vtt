import { section, yesNo, mebibytes, pixels, type ReportSection } from './reportModel';

/** The flags of Obsidian's `Platform` the report names. */
export const PLATFORM_FLAGS = [
  'isDesktop', 'isDesktopApp', 'isMobile', 'isMobileApp', 'isTablet', 'isPhone', 'isIosApp', 'isAndroidApp', 'isMacOS', 'isWin', 'isLinux', 'isSafari',
] as const;

/** Which of `PLATFORM_FLAGS` are set, the user agent, and how Atlas' device profile read the device. */
export function platformSection(flags: Readonly<Record<string, unknown>>, userAgent: string, profile: { memoryClass: string; pointer: string }): ReportSection {
  const set = PLATFORM_FLAGS.filter((flag) => flags[flag] === true);
  const unset = PLATFORM_FLAGS.filter((flag) => flags[flag] !== true);
  return section('Platform', [
    ['Set', set.join(', ') || 'none'],
    ['Not set', unset.join(', ') || 'none'],
    ['User agent', userAgent],
    ['Atlas device profile', `memory ${profile.memoryClass}, pointer ${profile.pointer}`],
  ]);
}

const CAPACITOR_FILES = '/_capacitor_file_/';

/**
 * How a resource URL begins: its scheme, its host and Capacitor's file marker where it has one.
 * Everything after that is the file's place on the device, which a report never holds.
 */
export function urlHead(url: string): string {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i.exec(url);
  if (!scheme) return 'no URL';
  const rest = url.slice(scheme[0].length);
  return `${scheme[1]}://${scheme[2]}${rest.startsWith(CAPACITOR_FILES) ? CAPACITOR_FILES : '/'}…`;
}

/** A vault file's resource URL beside what Atlas made of it; the file's own path stays out of the report. */
export interface ResourceSample {
  /** What `getResourcePath` answered for the file. */
  url: string;
  /** Whether Atlas' reading of the URL names the file again. */
  readBack: boolean;
}

/** What resource URLs look like here: `Platform.resourcePathPrefix` and a file's URL, by their heads alone. */
export function resourceSection(prefix: unknown, sample: ResourceSample | null): ReportSection {
  const known = typeof prefix === 'string' && prefix !== '';
  return section('Resource URLs', [
    ['Platform.resourcePathPrefix', known ? urlHead(prefix) : 'not set'],
    ...(sample === null
      ? [['A vault file', 'none to ask about'] as const]
      : [
        ['A vault file\'s URL', urlHead(sample.url)] as const,
        ['It starts with the prefix', yesNo(known && sample.url.startsWith(prefix))] as const,
        ['It carries a query', yesNo(sample.url.includes('?'))] as const,
        ['Atlas reads the file back from it', yesNo(sample.readBack)] as const,
      ]),
  ]);
}

const POINTER_QUERIES = ['(pointer: coarse)', '(pointer: fine)', '(any-pointer: coarse)', '(any-pointer: fine)', '(hover: hover)', '(hover: none)', '(any-hover: hover)'] as const;

/** The pointer and hover media answers and the touch points the device reports. */
export function pointerSection(win: Pick<Window, 'matchMedia' | 'navigator'>): ReportSection {
  const matches = (query: string): boolean => typeof win.matchMedia === 'function' && win.matchMedia(query).matches;
  return section('Pointer', [
    ['Media queries that match', POINTER_QUERIES.filter(matches).join(', ') || 'none'],
    ['maxTouchPoints', String(win.navigator.maxTouchPoints ?? 'not reported')],
  ]);
}

/** A window's size as the layout and as the eye see it. */
export interface ViewportSize {
  innerWidth: number;
  innerHeight: number;
  /** The visual viewport, where the window has one. */
  visual: { width: number; height: number; offsetTop: number; scale: number } | null;
}

export function viewportSize(win: Pick<Window, 'innerWidth' | 'innerHeight' | 'visualViewport'>): ViewportSize {
  const visual = win.visualViewport;
  return {
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    visual: visual ? { width: visual.width, height: visual.height, offsetTop: visual.offsetTop, scale: visual.scale } : null,
  };
}

const visualText = (size: ViewportSize): string => (size.visual
  ? `${pixels(size.visual.width, size.visual.height)}, offset top ${Math.round(size.visual.offsetTop)}, scale ${size.visual.scale}`
  : 'none');

export function viewportSection(win: Pick<Window, 'innerWidth' | 'innerHeight' | 'visualViewport' | 'devicePixelRatio' | 'screen'>): ReportSection {
  const size = viewportSize(win);
  return section('Viewport', [
    ['Window', pixels(size.innerWidth, size.innerHeight)],
    ['Visual viewport', visualText(size)],
    ['Screen', `${pixels(win.screen.width, win.screen.height)}, ${win.screen.orientation?.type ?? 'orientation not reported'}`],
    ['Device pixel ratio', String(win.devicePixelRatio)],
  ]);
}

/** Pixels a size must lose for the keyboard to have taken them: less is a toolbar or rounding. */
const KEYBOARD_MIN_HEIGHT = 100;

/**
 * How the on-screen keyboard changes the page, from the sizes before an input was focused and with
 * it: `window` where the window itself gets shorter (Capacitor's `native` resize, Android's
 * default), `visual` where only the visual viewport does, `none` where neither does (a hardware
 * keyboard, or a keyboard that floats).
 */
export function keyboardResize(before: ViewportSize, after: ViewportSize): 'window' | 'visual' | 'none' {
  if (before.innerHeight - after.innerHeight >= KEYBOARD_MIN_HEIGHT) return 'window';
  if (before.visual && after.visual && before.visual.height - after.visual.height >= KEYBOARD_MIN_HEIGHT) return 'visual';
  return 'none';
}

const RESIZE_TEXT = {
  window: 'the window gets shorter',
  visual: 'only the visual viewport gets shorter',
  none: 'nothing gets shorter (a hardware or floating keyboard?)',
} as const;

/** What focusing an input did to the viewport; `after` is null until the tester tapped the field. */
export function keyboardSection(before: ViewportSize, after: ViewportSize | null): ReportSection {
  if (after === null) return section('Keyboard', [['With an input focused', 'not tested: tap the field in the dialog']]);
  return section('Keyboard', [
    ['Window before, with keyboard', `${pixels(before.innerWidth, before.innerHeight)}, ${pixels(after.innerWidth, after.innerHeight)}`],
    ['Visual viewport before, with keyboard', `${visualText(before)}; ${visualText(after)}`],
    ['Resize mode', RESIZE_TEXT[keyboardResize(before, after)]],
  ]);
}

/** What of `navigator.storage` and IndexedDB the tile cache leans on. */
export interface StorageFacts {
  indexedDb: boolean;
  estimate: { quota?: number; usage?: number } | null;
  persisted: boolean | null;
}

export async function storageFacts(nav: Pick<Navigator, 'storage'> | undefined, hasIndexedDb: boolean): Promise<StorageFacts> {
  const storage = nav?.storage;
  const estimate = typeof storage?.estimate === 'function' ? await storage.estimate().catch(() => null) : null;
  const persisted = typeof storage?.persisted === 'function' ? await storage.persisted().catch(() => null) : null;
  return { indexedDb: hasIndexedDb, estimate, persisted };
}

export function storageSection(facts: StorageFacts): ReportSection {
  const { estimate } = facts;
  return section('Storage', [
    ['IndexedDB', yesNo(facts.indexedDb)],
    ['Quota', estimate?.quota === undefined ? 'not reported' : mebibytes(estimate.quota)],
    ['In use', estimate?.usage === undefined ? 'not reported' : mebibytes(estimate.usage)],
    ['Persisted', facts.persisted === null ? 'not reported' : yesNo(facts.persisted)],
  ]);
}

/** Whether `owner` has a function (or, for `wakeLock`, an object) under `key`. */
function has(owner: object | undefined | null, key: string): boolean {
  if (!owner) return false;
  const value: unknown = Reflect.get(owner, key);
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}

/** The web APIs Atlas feature-detects, by whether this web view has them. */
export function apiSection(scope: object): ReportSection {
  const nav: unknown = Reflect.get(scope, 'navigator');
  const navigatorObject = typeof nav === 'object' && nav !== null ? nav : undefined;
  const clipboard: unknown = navigatorObject ? Reflect.get(navigatorObject, 'clipboard') : undefined;
  const clipboardObject = typeof clipboard === 'object' && clipboard !== null ? clipboard : undefined;
  const scheduler: unknown = Reflect.get(scope, 'scheduler');
  const present: Array<readonly [string, boolean]> = [
    ['navigator.vibrate', has(navigatorObject, 'vibrate')],
    ['navigator.share', has(navigatorObject, 'share')],
    ['navigator.canShare', has(navigatorObject, 'canShare')],
    ['navigator.wakeLock', has(navigatorObject, 'wakeLock')],
    ['navigator.clipboard.write', has(clipboardObject, 'write')],
    ['navigator.clipboard.readText', has(clipboardObject, 'readText')],
    ['ClipboardItem', has(scope, 'ClipboardItem')],
    ['OffscreenCanvas', has(scope, 'OffscreenCanvas')],
    ['createImageBitmap', has(scope, 'createImageBitmap')],
    ['ImageDecoder', has(scope, 'ImageDecoder')],
    ['requestIdleCallback', has(scope, 'requestIdleCallback')],
    ['scheduler.yield', has(typeof scheduler === 'object' ? scheduler : undefined, 'yield')],
  ];
  return section('Web APIs', [
    ['Present', present.filter(([, there]) => there).map(([name]) => name).join(', ') || 'none'],
    ['Missing', present.filter(([, there]) => !there).map(([name]) => name).join(', ') || 'none'],
  ]);
}
