/**
 * The optional fields of a saved map (`SavedMapInput`) beyond its scene: pins, walls, lights, light zones, camera,
 * token settings and the tracker. Read leniently, as Atlas loads a map, for `readMap`; checked strictly, throwing,
 * before `addToCollection` or `replaceMap` writes anything.
 */
import { normalizePath } from 'obsidian';
import { lightZonesFromFile } from '../app/lighting/lightZones';
import { tokenSettingsFromFile, tokenSettingsToFile } from '../app/resources/resourceFileFormat';
import { DEFAULT_TOKEN_SETTINGS } from '../app/storeFactory';
import type { NotePin } from '../app/types';
import type { TokenSettings } from '../app/types/tokenSettingsTypes';
import type { SavedMapInput } from './types/scenes';

type Camera = NonNullable<SavedMapInput['camera']>;
/** The optional fields, every one set. */
export type SceneFields = Required<Pick<SavedMapInput, 'pins' | 'walls' | 'lights' | 'lightZones' | 'camera' | 'initiativeTrackerOpen'>>
  & { tokenSettings: TokenSettings };

const DEFAULT_CAMERA: Readonly<Camera> = Object.freeze({ x: 0, y: 0, scale: 1 });

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Whether `path` is a plain relative path: no empty, `.` or `..` segment, no leading slash or backslash. */
export function isPlainRelative(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && path.length < 1024 && !path.includes('\\') && !path.startsWith('/')
    && ![...path].some((character) => character.charCodeAt(0) < 0x20)
    && path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function isCamera(value: unknown): value is Camera {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.scale) && value.scale > 0;
}

const TOKEN_SETTING_CHECKS: { [Key in keyof TokenSettings]: (value: unknown) => boolean } = {
  showNameplates: (value) => typeof value === 'boolean',
  hiddenResources: (value) => Array.isArray(value) && value.every((key) => typeof key === 'string'),
  showInstanceBadges: (value) => typeof value === 'boolean',
  tokenRingSize: (value) => isFiniteNumber(value) && value > 0,
};

/** The four known token settings in `given` that have the right type, over Atlas's defaults; unknown keys are dropped. */
function tokenSettingsOver(given: Record<string, unknown>): TokenSettings {
  const settings: Record<string, unknown> = { ...DEFAULT_TOKEN_SETTINGS, hiddenResources: [...DEFAULT_TOKEN_SETTINGS.hiddenResources] };
  for (const [key, check] of Object.entries(TOKEN_SETTING_CHECKS)) if (check(given[key])) settings[key] = given[key];
  return settings as unknown as TokenSettings;
}

function recordOf<T>(value: unknown): Readonly<Record<string, T>> {
  return isRecord(value) ? (value as Record<string, T>) : {};
}

/** The optional fields of a saved file, as Atlas loads them: what cannot be read falls back to what a new map has. */
export function readSceneFields(
  state: { tokenSettings?: unknown; initiativeTrackerOpen?: unknown },
  map: { objects: { pins?: unknown; walls?: unknown; lights?: unknown; lightZones?: unknown }; camera?: unknown },
): SceneFields {
  return {
    pins: recordOf<NotePin>(map.objects.pins),
    walls: recordOf(map.objects.walls),
    lights: recordOf(map.objects.lights),
    lightZones: lightZonesFromFile(map.objects.lightZones) ?? {},
    camera: isCamera(map.camera) ? map.camera : { ...DEFAULT_CAMERA },
    tokenSettings: tokenSettingsOver(isRecord(state.tokenSettings) ? tokenSettingsFromFile(state.tokenSettings) : {}),
    initiativeTrackerOpen: state.initiativeTrackerOpen === true,
  };
}

function fail(message: string): never {
  throw new Error(`[Atlas API] ${message}`);
}

function checkedPin(id: string, value: unknown): NotePin {
  if (!isRecord(value)) fail(`The pin "${id}" must be a note pin.`);
  const { id: pinId, kind, x, y, notePath, icon, label, gmOnly, hex } = value;
  const optional = (field: unknown, type: 'string' | 'boolean'): boolean => field === undefined || typeof field === type;
  const path = typeof notePath === 'string' ? normalizePath(notePath) : notePath;
  if (typeof pinId !== 'string' || kind !== 'pin' || !isFiniteNumber(x) || !isFiniteNumber(y) || !isPlainRelative(path)
    || !optional(icon, 'string') || !optional(label, 'string') || !optional(gmOnly, 'boolean') || !optional(hex, 'boolean')) {
    fail(`The pin "${id}" must be { id, kind: 'pin', x, y, notePath } with a plain vault path.`);
  }
  return {
    id: pinId, kind, x, y, notePath: path,
    ...(typeof icon === 'string' && { icon }), ...(typeof label === 'string' && { label }),
    ...(typeof gmOnly === 'boolean' && { gmOnly }), ...(typeof hex === 'boolean' && { hex }),
  };
}

function checkedRecord<T>(field: string, value: unknown): Record<string, T> {
  if (!isRecord(value)) fail(`The map's "${field}" must be a record by id.`);
  return value as Record<string, T>;
}

function checkedTokenSettings(value: unknown): TokenSettings {
  if (!isRecord(value)) fail('The map\'s "tokenSettings" must be an object.');
  for (const [key, check] of Object.entries(TOKEN_SETTING_CHECKS)) {
    if (value[key] !== undefined && !check(value[key])) fail(`The token setting "${key}" has the wrong type.`);
  }
  return tokenSettingsOver(value);
}

/** The optional fields of `map`, checked; throws on the first malformed one. A field left out is what a new map has. */
export function checkedSceneFields(map: SavedMapInput): SceneFields {
  const given = map as Partial<Record<keyof SceneFields, unknown>>;
  const pins = given.pins === undefined ? {} : checkedRecord<unknown>('pins', given.pins);
  if (given.camera !== undefined && !isCamera(given.camera)) fail('The map\'s "camera" must be finite x and y with a scale above 0.');
  const zones = given.lightZones === undefined ? {} : lightZonesFromFile(given.lightZones);
  if (!zones) fail('The map\'s "lightZones" must be a record by id.');
  const camera = given.camera;
  return {
    pins: Object.fromEntries(Object.entries(pins).map(([id, pin]) => [id, checkedPin(id, pin)])),
    walls: given.walls === undefined ? {} : checkedRecord('walls', given.walls),
    lights: given.lights === undefined ? {} : checkedRecord('lights', given.lights),
    lightZones: zones,
    camera: camera ? { x: camera.x, y: camera.y, scale: camera.scale } : { ...DEFAULT_CAMERA },
    tokenSettings: given.tokenSettings === undefined ? tokenSettingsOver({}) : checkedTokenSettings(given.tokenSettings),
    initiativeTrackerOpen: given.initiativeTrackerOpen === true,
  };
}

/** Whether `map` sets any optional field; a map that sets none is written exactly as before they existed. */
export function setsSceneFields(map: SavedMapInput): boolean {
  return (['pins', 'walls', 'lights', 'lightZones', 'camera', 'tokenSettings', 'initiativeTrackerOpen'] as const)
    .some((field) => map[field] !== undefined);
}

/** The token settings as a map file holds them: with their bar switches, as Atlas's own save writes them. */
export function tokenSettingsForFile(settings: TokenSettings): Record<string, unknown> {
  return tokenSettingsToFile({ ...settings });
}

/**
 * `input` read once: a deep copy, so nothing a getter or a later change of the extension's object does reaches what
 * Atlas checked and writes. Throws `[Atlas API] <where>: …` for input that is not plain data (a function, a DOM node).
 */
export function inputCopy<T>(input: T, where: string): T {
  try {
    return structuredClone(input);
  } catch {
    throw new Error(`[Atlas API] ${where}: the input must be plain data (objects, arrays, strings, numbers and ArrayBuffers).`);
  }
}

/** Whether an image's `data` is an ArrayBuffer (a copy keeps it one; a view or anything else is refused). */
export const isImageData = (data: unknown): data is ArrayBuffer => data instanceof ArrayBuffer;
