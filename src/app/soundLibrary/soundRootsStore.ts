import type { SoundKind } from '../sound/soundTypes';
import { isRecord } from '../utils/guards';
import { safeRelative } from './soundPaths';

/** What every device shares of a root: a folder of the vault, or that it lies outside the vault, which each device links for itself. */
export type SharedSoundRoot = { type: 'vault'; path: string } | { type: 'external' };

export type SharedSoundRoots = Partial<Record<SoundKind, SharedSoundRoot>>;

function readRoot(value: unknown): SharedSoundRoot | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === 'external') return { type: 'external' };
  const path = typeof value.path === 'string' ? safeRelative(value.path) : null;
  return value.type === 'vault' && path !== null ? { type: 'vault', path } : undefined;
}

/** The stored roots, which a hand or a sync tool may have changed: what cannot be read is no link. */
export function readSharedSoundRoots(value: unknown): SharedSoundRoots {
  if (!isRecord(value)) return {};
  const music = readRoot(value.music);
  const ambience = readRoot(value.ambience);
  return { ...(music && { music }), ...(ambience && { ambience }) };
}
