import { normalizePath } from 'obsidian';
import { INVALID_NAME_CHARACTERS } from '../assetPaths';

/** A name a file or folder can carry: characters Obsidian rejects or that break links become `-`; `fallback` for none. */
export function nameStem(name: unknown, fallback: string): string {
  const text = typeof name === 'string' ? name : '';
  const cleaned = text.trim().replace(new RegExp(INVALID_NAME_CHARACTERS.source, 'g'), '-').replace(/^\.+/, '').trim();
  return cleaned || fallback;
}

/**
 * `<folder>/<stem><suffix>`, else `<stem> 2<suffix>`, `<stem> 3<suffix>`, … while that is taken.
 * `isTaken` answers in any letter case: macOS and Windows do not tell names apart by it.
 */
export function freeNamedPath(folder: string, stem: string, suffix: string, isTaken: (path: string) => boolean): string {
  const pathOf = (base: string): string => normalizePath(`${folder}/${base}${suffix}`);
  let path = pathOf(stem);
  for (let n = 2; isTaken(path); n++) path = pathOf(`${stem} ${n}`);
  return path;
}

/** Whether the last part of `path`, less `suffix`, is named after `stem` (`Name`, or `Name 2` beside another). */
export function isNamedAfterStem(path: string, stem: string, suffix: string): boolean {
  const last = path.slice(path.lastIndexOf('/') + 1);
  const base = suffix === '' ? last : last.slice(0, -suffix.length);
  return base === stem || new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+$`).test(base);
}
