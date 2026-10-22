import type { ResourceHolder, ResourceValue } from './resourceTypes';
import { resourceUpdate } from './resourceValues';

/**
 * The token update for a value typed into a resource's editor, made on the token as the store
 * holds it now (it may have changed since the editor opened); its maximum counts as set by hand
 * where it changed. Null when the token or its value is gone.
 */
export function typedResourceUpdate(
  live: ResourceHolder | undefined,
  key: string,
  next: ResourceValue,
): ReturnType<typeof resourceUpdate> | null {
  const stored = live?.resources?.[key];
  if (!live || !stored) return null;
  return resourceUpdate(live, key, next, next.max !== stored.max);
}
