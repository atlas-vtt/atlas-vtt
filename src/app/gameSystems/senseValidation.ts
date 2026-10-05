/**
 * Reads senses from stored data (a user preset, a collection's settings, default vision). The
 * data can be edited by hand or written by another Atlas version, so every field is checked.
 */

import type { DarkSeeing, SenseDefinition, SenseLook, SenseRange, SenseRole, SenseSight, TokenSense } from '../types/senseTypes';
import { isRecord } from '../utils/guards';
import { positiveNumber } from '../utils/numberInput';
import type { SystemPreset } from '../types/systemPresetTypes';
import { collectionSenses, findSense } from './senseRules';
import { NORMAL_SIGHT } from './senses/generic';
import { granting } from './senses/senseHelpers';

const BRIGHT: readonly SenseSight['bright'][] = ['none', 'normal'];
const DIM: readonly SenseSight['dim'][] = ['none', 'normal', 'as-bright'];
const DARK: readonly DarkSeeing[] = ['none', 'as-dim', 'as-bright'];
const LOOKS: readonly SenseLook[] = ['colour', 'monochrome', 'black-and-white', 'heat'];
const RANGES: readonly SenseRange[] = ['unlimited', 'required', 'optional'];
const ROLES: readonly SenseRole[] = ['darkvision', 'tremorsense'];

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function parseSight(raw: unknown): SenseSight {
  const sees = isRecord(raw) ? raw : {};
  return {
    bright: oneOf(BRIGHT, sees.bright, 'none'),
    dim: oneOf(DIM, sees.dim, 'none'),
    dark: oneOf(DARK, sees.dark, 'none'),
    magicalDark: oneOf(DARK, sees.magicalDark, 'none'),
  };
}

/**
 * A stored sense, or null without a usable id (blank, or the one reserved for normal sight) or
 * a name. Every other field that cannot be used takes the value that shows the players less:
 * walls stop the sense, it perceives nothing at that light level, senses creatures only and
 * imprecisely, sees nothing invisible, is lost while blinded and needs a distance. A sense that
 * walls do not stop never shows the map, whatever is stored: it senses creatures. A modifier
 * (`grants`) keeps only its id, name and description.
 */
function parseSenseDefinition(raw: unknown): SenseDefinition | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.trim() === '' || raw.id === NORMAL_SIGHT.id) return null;
  if (typeof raw.name !== 'string' || raw.name.trim() === '') return null;
  const named = { id: raw.id, name: raw.name.trim(), description: typeof raw.description === 'string' ? raw.description : '' };
  if (raw.grants === 'see-invisible') return { ...named, ...granting(raw.grants) };
  const defaultRange = positiveNumber(raw.defaultRange);
  const role = oneOf<SenseRole | ''>(ROLES, raw.role, '');
  return {
    ...named,
    lineOfSight: raw.lineOfSight !== false,
    sees: parseSight(raw.sees),
    look: oneOf(LOOKS, raw.look, 'colour'),
    reveals: raw.reveals === 'all' && raw.lineOfSight !== false ? 'all' : 'creatures',
    precise: raw.precise === true,
    seesInvisible: raw.seesInvisible === true,
    worksWhileBlinded: raw.worksWhileBlinded === true,
    range: oneOf(RANGES, raw.range, 'required'),
    ...(defaultRange !== undefined && { defaultRange }),
    ...(raw.ignores === 'airborne' && { ignores: 'airborne' as const }),
    ...(role !== '' && { role }),
  };
}

/**
 * Every usable sense in `raw`, the first one kept when ids repeat; undefined when `raw` is no
 * list. Only the first sense of a `role` keeps it, so an old number is read as one sense.
 */
export function parseSenseDefinitions(raw: unknown): SenseDefinition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = new Set<string>();
  const roles = new Set<SenseRole>();
  return raw.flatMap((entry) => {
    const sense = parseSenseDefinition(entry);
    if (!sense || ids.has(sense.id)) return [];
    ids.add(sense.id);
    if (sense.role === undefined) return [sense];
    const { role, ...withoutRole } = sense;
    if (roles.has(role)) return [withoutRole];
    roles.add(role);
    return [sense];
  });
}

/**
 * The senses of a token or of default vision as stored: entries with an id, a distance only
 * when it is above 0, the first kept when ids repeat. With the collection's `definitions`,
 * senses it does not know are dropped (`findSense`); without, they are kept, since they may be
 * another collection's. Undefined when `raw` is no list.
 */
export function parseTokenSenses(raw: unknown, definitions?: readonly SenseDefinition[]): TokenSense[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  return raw.flatMap((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '' || seen.has(entry.id)) return [];
    if (definitions && !findSense(definitions, entry.id)) return [];
    seen.add(entry.id);
    const range = positiveNumber(entry.range);
    return [{ id: entry.id, ...(range !== undefined && { range }) }];
  });
}

/**
 * The senses of a collection from its stored settings: its own as far as they can be used
 * (`parseSenseDefinitions`), else its preset's, else the generic set (`collectionSenses`).
 */
export function readCollectionSenses(
  settings: { senses?: unknown; systemPresetId?: string | undefined },
  presets: readonly SystemPreset[],
): readonly SenseDefinition[] {
  return collectionSenses({ senses: parseSenseDefinitions(settings.senses), systemPresetId: settings.systemPresetId }, presets);
}
