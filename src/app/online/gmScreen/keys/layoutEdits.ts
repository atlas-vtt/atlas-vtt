import {
  isFolderGlyph, isForeignKey, isKeyCommand, layoutKeyCount, MAX_FOLDER_DEPTH, MAX_KEY_TEXT, MAX_LAYOUT_KEYS, slotPrint, slotsAt,
  type GmScreenDevice, type GmScreenLayout, type KeyChoice, type LayoutEdit, type LayoutKey, type LayoutRefusal, type LayoutSlot, type SlotPath, type SlotPrint,
} from '../../protocol/index.ts';

/** What Atlas knows of the keys a device chooses: its moods' names, the map in front's saved rolls, and whether the dice tool rolls a formula. */
export interface KeyLibrary {
  moodName(id: string): string | null;
  rollName(id: string): string | null;
  rollable(formula: string): boolean;
}

export type EditResult = { readonly layout: GmScreenLayout } | { readonly refused: LayoutRefusal };

type Slots = readonly LayoutSlot[];

/** The slot at `path`, or undefined where a slot on the way holds no folder. */
function slotAt(slots: Slots, path: SlotPath): LayoutSlot | undefined {
  let grid: Slots = slots;
  for (const place of path.slice(0, -1)) {
    const slot = grid[place];
    if (slot == null || isForeignKey(slot) || slot.k !== 'folder') return undefined;
    grid = slot.slots;
  }
  return grid[path.at(-1) ?? 0];
}

/** `slots` with `slot` at `path`, whose way `slotAt` found. */
function withSlot(slots: Slots, path: readonly number[], slot: LayoutSlot): Slots {
  const [place = 0, ...rest] = path;
  return slots.map((each, index) => {
    if (index !== place) return each;
    if (rest.length === 0) return slot;
    return each !== null && !isForeignKey(each) && each.k === 'folder' ? { ...each, slots: withSlot(each.slots, rest, slot) } : each;
  });
}

/** How many folders deep the deepest folder in `slot` lies, `slot` itself the first: 0 where it holds none. */
function folderDepth(slot: LayoutSlot): number {
  if (slot === null || isForeignKey(slot) || slot.k !== 'folder') return 0;
  return 1 + Math.max(0, ...slot.slots.map(folderDepth));
}

/** Whether `slot` may lie at `path`: the grid it stands in is `path.length - 1` folders down. */
const fitsAt = (slot: LayoutSlot, path: SlotPath): boolean => path.length - 1 + folderDepth(slot) <= MAX_FOLDER_DEPTH;

const inside = (outer: SlotPath, inner: SlotPath): boolean => inner.length > outer.length && outer.every((place, depth) => inner[depth] === place);

/** The key a device chose, with the names of Atlas's own library; an empty folder of the size its place needs. */
function keyOf(choice: KeyChoice, at: SlotPath, device: GmScreenDevice, library: KeyLibrary): LayoutKey | LayoutRefusal {
  switch (choice.k) {
    case 'command':
      return isKeyCommand(choice.command) ? { k: 'command', command: choice.command } : 'unknown-command';
    case 'mood': {
      const name = library.moodName(choice.id);
      return name === null ? 'no-mood' : { k: 'mood', id: choice.id, name: name.slice(0, MAX_KEY_TEXT) };
    }
    case 'roll': {
      const name = library.rollName(choice.id);
      return name === null ? 'no-roll' : { k: 'roll', id: choice.id, name: name.slice(0, MAX_KEY_TEXT) };
    }
    case 'dice':
      return library.rollable(choice.formula) ? { k: 'dice', formula: choice.formula } : 'bad-formula';
    case 'moods':
      return { k: 'moods' };
    case 'folder':
      if (!isFolderGlyph(choice.glyph)) return 'unknown-glyph';
      return { k: 'folder', name: choice.name, glyph: choice.glyph, slots: Array.from({ length: slotsAt(device, at.length) }, () => null) };
  }
}

function put(slots: Slots, at: SlotPath, choice: KeyChoice, device: GmScreenDevice, library: KeyLibrary): EditResult {
  if (slotAt(slots, at) === undefined) return { refused: 'no-slot' };
  const key = keyOf(choice, at, device, library);
  if (typeof key === 'string') return { refused: key };
  if (!fitsAt(key, at)) return { refused: 'too-deep' };
  const next = withSlot(slots, at, key);
  return layoutKeyCount(next) > MAX_LAYOUT_KEYS ? { refused: 'full' } : { layout: { slots: next } };
}

/** Swaps two slots: a key moved onto an empty slot leaves its own empty. */
function move(slots: Slots, from: SlotPath, to: SlotPath): EditResult {
  const moved = slotAt(slots, from);
  const there = slotAt(slots, to);
  if (moved === undefined || there === undefined) return { refused: 'no-slot' };
  if (inside(from, to) || inside(to, from)) return { refused: 'into-itself' };
  if (!fitsAt(moved, to) || !fitsAt(there, from)) return { refused: 'too-deep' };
  return { layout: { slots: withSlot(withSlot(slots, from, there), to, moved) } };
}

function rename(slots: Slots, at: SlotPath, name: string, glyph: string): EditResult {
  const slot = slotAt(slots, at);
  if (slot === undefined) return { refused: 'no-slot' };
  if (slot === null || isForeignKey(slot) || slot.k !== 'folder') return { refused: 'not-folder' };
  if (!isFolderGlyph(glyph)) return { refused: 'unknown-glyph' };
  return { layout: { slots: withSlot(slots, at, { ...slot, name, glyph }) } };
}

/**
 * Whether a slot the edit names no longer holds what the device saw there: the device acted on a grid another device or
 * Atlas changed since. A slot whose way is gone is left to the edit, which refuses it as `no-slot`.
 */
function changedSince(slots: Slots, edit: LayoutEdit): boolean {
  const seen: readonly (readonly [SlotPath, SlotPrint | undefined])[] = edit.op === 'move' ? [[edit.from, edit.held], [edit.to, edit.there]] : [[edit.at, edit.held]];
  return seen.some(([path, print]) => {
    const slot = print === undefined ? undefined : slotAt(slots, path);
    return slot !== undefined && slotPrint(slot) !== print;
  });
}

/** `layout` with `edit` applied, or why it was refused; a refused edit changes nothing. */
export function applyLayoutEdit(layout: GmScreenLayout, edit: LayoutEdit, device: GmScreenDevice, library: KeyLibrary): EditResult {
  if (changedSince(layout.slots, edit)) return { refused: 'changed' };
  switch (edit.op) {
    case 'put':
      return put(layout.slots, edit.at, edit.key, device, library);
    case 'move':
      return move(layout.slots, edit.from, edit.to);
    case 'remove':
      return slotAt(layout.slots, edit.at) === undefined ? { refused: 'no-slot' } : { layout: { slots: withSlot(layout.slots, edit.at, null) } };
    case 'rename':
      return rename(layout.slots, edit.at, edit.name, edit.glyph);
  }
}
