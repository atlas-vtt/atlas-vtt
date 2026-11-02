import { INVALID_NAME_CHARACTERS } from '../services/assetPaths';
import type { SoundKind } from '../sound/soundTypes';

/**
 * Where a record of a file in an external root says its file lies: the root's kind and the path below
 * it, never an absolute path, since every device links its own folder. The colon can stand in no vault
 * path, so whatever reads `audioPath` as a vault path finds nothing there and shows the sound as
 * waiting for its file.
 */
const EXTERNAL_PREFIX = 'atlas-sound:';

const invalidInName = new RegExp(INVALID_NAME_CHARACTERS.source);

/**
 * A path below a root in `/`-form, or null when it could leave the root: an absolute part, a drive, a
 * backslash, `..`, `.`, an empty part or a NUL. The empty path is the root itself.
 */
export function safeRelative(path: string): string | null {
  if (path === '') return '';
  if (path.includes('\0') || path.includes('\\') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return null;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..') ? path : null;
}

/** Whether a root's listing can show a name: nothing hidden, and nothing that cannot be a part of a path below it. */
export const isListableName = (name: string): boolean => !name.startsWith('.') && safeRelative(name) !== null;

/** A name for a renamed file, trimmed; null where it cannot be one. */
export function safeName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed === '' || trimmed.startsWith('.') || invalidInName.test(trimmed) ? null : trimmed;
}

/** What a file brought from outside may be named here: what cannot stand in a name is replaced. */
export const asFileName = (name: string): string =>
  name.replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '-').replace(/^\.+/, '') || 'sound';

export const joinRelative = (folder: string, name: string): string => (folder === '' ? name : `${folder}/${name}`);

export const parentOfRelative = (path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
};

export const nameOfRelative = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** Whether `path` is `folder` or lies below it. */
export const isWithin = (folder: string, path: string): boolean =>
  folder === '' || path === folder || path.startsWith(`${folder}/`);

/** `path` as it is once `from` has become `to`; null where `path` is not `from` or below it. */
export function movedRelative(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : null;
}

export const stemOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

/** `name`, or the first of `name 2`, `name 3`… nothing has; files never replace each other. */
export async function freeName(name: string, isTaken: (candidate: string) => boolean | Promise<boolean>): Promise<string> {
  if (!(await isTaken(name))) return name;
  const stem = stemOf(name);
  const extension = name.slice(stem.length);
  for (let number = 2; ; number++) {
    const candidate = `${stem} ${number}${extension}`;
    if (!(await isTaken(candidate))) return candidate;
  }
}

export const externalAudioPath = (root: SoundKind, path: string): string => `${EXTERNAL_PREFIX}${root}/${path}`;

export const isExternalAudioPath = (audioPath: string): boolean => audioPath.startsWith(EXTERNAL_PREFIX);

/** The root and the path an external record names; null for a vault path or one that could leave its root. */
export function readExternalAudioPath(audioPath: string): { root: SoundKind; path: string } | null {
  if (!isExternalAudioPath(audioPath)) return null;
  const rest = audioPath.slice(EXTERNAL_PREFIX.length);
  const slash = rest.indexOf('/');
  const root = rest.slice(0, slash);
  if (slash < 0 || (root !== 'music' && root !== 'ambience')) return null;
  const path = safeRelative(rest.slice(slash + 1));
  return path === null || path === '' ? null : { root, path };
}

/**
 * `absolute` below `base` in `/`-form: the empty path for `base` itself, null where it lies elsewhere.
 * Windows paths are told by their separator and compared without case, as that system does.
 */
export function relativeBelow(base: string, absolute: string): string | null {
  const windows = base.includes('\\') || absolute.includes('\\');
  const form = (path: string): string => {
    const slashes = windows ? path.replace(/\\/g, '/') : path;
    return slashes.replace(/\/+$/, '');
  };
  const from = form(base);
  const to = form(absolute);
  const same = (a: string, b: string): boolean => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (same(from, to)) return '';
  return same(to.slice(0, from.length + 1), `${from}/`) ? to.slice(from.length + 1) : null;
}
