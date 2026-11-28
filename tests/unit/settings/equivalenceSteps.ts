import { DEFAULT_DRAW_TOOL } from '../../../src/app/annotations/annotationTypes';
import defaults0212 from '../../fixtures/settings/data-0.21.2-defaults.json';
import filled0212 from '../../fixtures/settings/data-0.21.2-filled.json';
import file0120 from '../../fixtures/settings/data-0.12.0.json';
import newerFile from '../../fixtures/settings/data-newer.json';
import type { PreferenceName } from './preferenceAccess';

/** A seeded generator (mulberry32): the same seed gives the same sequence on every run. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

/** What each preference is written with: changes, its default, partial records and values out of range. */
export const VALUES: Record<PreferenceName, readonly unknown[]> = {
  showChangelogOnUpdate: [true, false],
  changelogMajorUpdatesOnly: [true, false],
  checkForUpdates: [true, false],
  starterTokensAdded: [true, false],
  onboarding: [
    { enabled: false, completed: { map: true }, tokenImported: true },
    { enabled: true, completed: {}, tokenImported: false },
    { enabled: true, completed: { welcome: true }, tokenImported: false },
  ],
  hotkeys: ['j', 'm', 'F7', ''],
  hiddenStarterOffers: [true, false],
  hiddenSoundOffers: [true, false],
  laserPointer: [{ size: 40 }, { color: '#00a9ff' }, { color: '#ff0059', size: 16 }, { size: 500 }],
  diceDisplay: ['card', 'fast', 'full'],
  diceVolume: [0.5, 1, 0, 1.5, -1],
  sound: [{ musicDb: -3 }, { followScenes: false }, { fadeSeconds: 4 }, { musicDb: 100, crossfadeSeconds: 2 }],
  soundRoots: [{ music: { type: 'vault', path: 'Music' } }, {}, { ambience: { type: 'external' } }],
  detectGridOnNewScenes: [true, false],
  fogEdge: [{ width: 30 }, { style: 'soft' }, { style: 'crackle', width: 15 }],
  dragDistance: ['always', 'combat', 'never'],
  diceLook: [{ colour: 'dark' }, { font: 'scifi' }, { colour: 'light', font: 'medieval' }],
  initiativeCompact: [true, false],
  initiativeLayout: [{ dock: 'top' }, { edges: ['top', 'bottom'] }, { facesPlayers: true }, { dock: 'right' }, { edges: ['right'] }],
  initiativeTurnOptions: [{ movesOnTurn: true }, { banner: false }, { banner: true, movesOnTurn: false }],
  experimental: [true, false],
  toolbar: [{ hidden: ['fog'] }, {}, { order: ['fog', 'move'] }],
  toolbarAutoHide: [true, false],
  gmScreenKeys: [{ watch: { columns: 2 } }, {}],
  dungeonGenerator: [{ floors: 2 }, { fiveRoom: true }, { floors: 1 }],
  localPlayerView: [{ showWidgets: false }, { showToolbar: true }, { showWidgets: true }, { initiativeScale: 2 }],
  tableTv: [{ viewGlideMs: 0 }, { viewGlideMs: 800 }],
  inputMode: ['mouse', 'trackpad'],
  graphics: [{ preset: 'saver', overrides: {} }, { preset: 'high', overrides: {} }, { preset: 'balanced', overrides: {} }],
  pickedLightingQuality: ['balanced', 'high'],
  animateMaps: [true, false],
  playerView4k: [true, false],
  selectionBar: [true, false],
  gmFogOpacity: [0.8, 0.5, 2],
  tableTvDevice: [{ trueScale: true }, { cellMm: 30 }, { trueScale: false }],
  drawTool: [{ ...DEFAULT_DRAW_TOOL, color: '#123456' }, DEFAULT_DRAW_TOOL],
  penSeen: [true],
  fingerUse: ['pan', 'tool'],
  zoomButtons: [true, false],
};

const FILES: readonly unknown[] = [null, defaults0212, filled0212, file0120, newerFile];
/** Values planted in files under keys whose preference may not take them. */
export const MALFORMED: readonly unknown[] = ['x', 0, -1, [], {}, { bogus: 1 }, true, 'yes'];
const MALFORMED_DEVICE: readonly string[] = ['x', '{bad', 'true', '2', '{"a":1}'];

/** A settings file: a fixture or none, half of the time with some of `keys` holding values Atlas cannot use. */
export function randomFile(random: () => number, keys: readonly string[]): unknown {
  const base = structuredClone(pick(random, FILES));
  if (random() < 0.5) return base;
  const file: Record<string, unknown> = { ...(base as Record<string, unknown> | null) };
  // Hidden offers with the pin's own ids first, so hiding one again could move it
  if (random() < 0.3) Object.assign(file, { hiddenStarterOffers: ['collection-1', '0f3c-collection'], hiddenSoundOffers: ['starter-ambience', 'vindsvept-music'] });
  for (const key of keys) if (random() < 0.15) file[key] = pick(random, MALFORMED);
  return file;
}

/** A device's local storage with about a tenth of `keys` holding values Atlas cannot use. */
export function randomDevice(random: () => number, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.filter(() => random() < 0.1).map((key) => [key, pick(random, MALFORMED_DEVICE)]));
}

/** One step of a sequence: a write, the save's wait, a restart, or another device's file arriving. */
export type Step =
  | { kind: 'write'; name: PreferenceName; value: unknown }
  | { kind: 'wait' }
  | { kind: 'restart' }
  | { kind: 'arrive'; file: unknown };

type Record_ = Record<string, unknown>;
interface OtherDeviceChange { key: string; change: (file: Record_) => Record_ }
const field = (key: string, name: string, value: unknown): OtherDeviceChange =>
  ({ key, change: (file) => ({ ...file, [key]: { ...((typeof file[key] === 'object' && file[key] !== null ? file[key] : {}) as Record_), [name]: value } }) });
const key = (name: string, value: unknown): OtherDeviceChange => ({ key: name, change: (file) => ({ ...file, [name]: value }) });

/** What another device changes in a file it shares with this one: one key, or one field of one key. */
const OTHER_DEVICE: readonly OtherDeviceChange[] = [
  field('hotkeys', 'futureAction', 'F9'), field('hotkeys', 'futureAction', 'F10'), field('hotkeys', 'measure', 'k'),
  key('diceColour', 'dark'), key('diceFont', 'scifi'), key('diceVolume', 0.3), key('diceDisplay', 'card'),
  key('initiativeBanner', false), key('initiativeMovesOnTurn', true), key('initiativeDock', 'top'), key('initiativeFacesPlayers', true),
  field('sound', 'musicDb', -9), field('laserPointer', 'color', '#00a9ff'), field('fogEdge', 'style', 'soft'),
  field('localPlayerView', 'showToolbar', true), field('tableTv', 'futureField', 3), field('dungeonGenerator', 'fiveRoom', true),
  field('onboarding', 'tokenImported', true), field('experimental', 'statblockEditor', true), field('toolbar', 'order', ['fog', 'move']),
  key('hiddenStarterOffers', ['zzz']), key('futureSetting', 'kept'),
];

/**
 * One step. Half of the files that arrive are the file this device holds with one thing another
 * device changed, half of those beside a key this device just changed (`touched`); the other half
 * a fixture, as after a long time apart.
 */
export function randomStep(random: () => number, names: readonly PreferenceName[], syncedKeys: readonly string[], current: unknown, touched: readonly string[]): Step {
  const roll = random();
  if (roll < 0.72) {
    const name = pick(random, names);
    return { kind: 'write', name, value: pick(random, VALUES[name]) };
  }
  if (roll < 0.82) return { kind: 'wait' };
  if (roll < 0.88) return { kind: 'restart' };
  if (random() < 0.5) {
    const near = OTHER_DEVICE.filter((other) => touched.includes(other.key));
    const other = near.length > 0 && random() < 0.5 ? pick(random, near) : pick(random, OTHER_DEVICE);
    return { kind: 'arrive', file: other.change({ ...(current as Record_ | null) }) };
  }
  return { kind: 'arrive', file: randomFile(random, syncedKeys) };
}
