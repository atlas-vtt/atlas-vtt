import { canShareHotkey, DEFAULT_MAP_HOTKEYS, MAP_HOTKEYS, type MapHotkeyId, type MapHotkeys } from './mapHotkeys';

/**
 * The bindings a user changed, which is all Atlas saves: the defaults come from
 * the code, so a later version can improve them. An empty string unbinds an action.
 */
export type HotkeyOverrides = Partial<MapHotkeys>;

const isHotkeyId = (id: string): id is MapHotkeyId => MAP_HOTKEYS.some(action => action.id === id);

/**
 * Reads saved bindings. Earlier versions saved every binding, so a value equal to its
 * default is dropped: no default had changed while they did, so it was never a choice.
 */
export function readHotkeyOverrides(stored: unknown): HotkeyOverrides {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const overrides: HotkeyOverrides = {};
  for (const [id, key] of Object.entries(stored)) {
    if (isHotkeyId(id) && typeof key === 'string' && key !== DEFAULT_MAP_HOTKEYS[id]) overrides[id] = key;
  }
  return overrides;
}

/**
 * Saved bindings of actions this Atlas does not have. A newer Atlas on another device may
 * have added them, so they are written back unchanged.
 */
export function foreignHotkeys(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => !isHotkeyId(entry[0]) && typeof entry[1] === 'string'));
}

/**
 * Saved bindings this Atlas does not apply as choices: actions it does not have, and
 * bindings equal to its own default. Devices share the settings, and another version may
 * have another default, so both are written back as they were.
 */
export function keptHotkeys(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string' && (!isHotkeyId(entry[0]) || entry[1] === DEFAULT_MAP_HOTKEYS[entry[0]])));
}

/** Binds `id` to `key`; binding an action to its default removes the override. */
export function withHotkey(overrides: HotkeyOverrides, id: MapHotkeyId, key: string): HotkeyOverrides {
  const others = Object.entries(overrides).filter(([other]) => other !== id);
  return Object.fromEntries(key === DEFAULT_MAP_HOTKEYS[id] ? others : [...others, [id, key]]);
}

/** How an action's binding relates to its default, for the settings. */
export type HotkeyOrigin =
  | { kind: 'default' }
  | { kind: 'custom' }
  /** A later default took a key the user bound to `by`, so the action is unbound. */
  | { kind: 'displaced'; by: MapHotkeyId };

/** The action whose user binding holds `id`'s default key, which leaves `id` unbound. */
function displacingAction(overrides: HotkeyOverrides, id: MapHotkeyId): MapHotkeyId | undefined {
  const key = DEFAULT_MAP_HOTKEYS[id];
  if (!key || id in overrides) return undefined;
  return (Object.keys(overrides) as MapHotkeyId[]).find(other => overrides[other] === key && !canShareHotkey(other, id));
}

export function hotkeyOrigin(overrides: HotkeyOverrides, id: MapHotkeyId): HotkeyOrigin {
  if (id in overrides) return { kind: 'custom' };
  const by = displacingAction(overrides, id);
  return by ? { kind: 'displaced', by } : { kind: 'default' };
}

/**
 * The defaults with the user's bindings on top. A default that takes a key the user
 * bound to another action (a later version gave it that key) is unbound: the user's choice wins.
 */
export function resolveHotkeys(overrides: HotkeyOverrides): MapHotkeys {
  const bindings = { ...DEFAULT_MAP_HOTKEYS, ...overrides };
  for (const action of MAP_HOTKEYS) {
    if (displacingAction(overrides, action.id)) bindings[action.id] = '';
  }
  return bindings;
}
