import { describe, expect, it } from 'vitest';
import {
  GM_SCREEN_DEVICES, GRID_SLOTS, layoutKeyCount, MAX_DEVICE_MESSAGE, MAX_FOLDER_DEPTH, MAX_FOLDER_NAME, MAX_FOREIGN_KEY, MAX_GM_SCREEN_MESSAGE, MAX_KEY_TEXT,
  MAX_LAYOUT_KEYS, MAX_SHOWN_FOREIGN_KEY, parseDeviceMessage, parseGmScreenMessage, parseLayout, parseLayoutEdit, shownLayout,
  type DeviceMessage, type GmScreenDevice, type GmScreenLayout, type LayoutSlot,
} from '../../../../src/app/online/protocol/index.ts';

/** Text whose JSON is as long as text of that length can be: every character is written as a six-character escape. */
const worst = (length: number): string => '\u0001'.repeat(length);
const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
const empty = (count: number): LayoutSlot[] => Array.from({ length: count }, () => null);

function folder(device: GmScreenDevice, slots: LayoutSlot[] = [], name = 'Folder'): LayoutSlot {
  return { k: 'folder', name, glyph: 'skull', slots: [...slots, ...empty(GRID_SLOTS[device] - 1 - slots.length)] };
}

/** Folders `levels` deep down the first place of each, the deepest holding `inside`. */
function nested(device: GmScreenDevice, levels: number, inside: LayoutSlot[] = []): LayoutSlot {
  return levels === 1 ? folder(device, inside) : folder(device, [nested(device, levels - 1, inside)]);
}

/** A grid holding `MAX_LAYOUT_KEYS` keys, every text at its longest and written in the longest JSON. */
function largestLayout(device: GmScreenDevice): GmScreenLayout {
  const size = GRID_SLOTS[device];
  const key = (index: number): LayoutSlot => ({ k: 'mood', id: `${index}${worst(MAX_KEY_TEXT - String(index).length)}`, name: worst(MAX_KEY_TEXT) });
  let made = 0;
  const fill = (count: number, depth: number): LayoutSlot[] => Array.from({ length: count }, (): LayoutSlot => {
    if (made >= MAX_LAYOUT_KEYS) return null;
    made += 1;
    if (depth < MAX_FOLDER_DEPTH) return { k: 'folder', name: worst(MAX_FOLDER_NAME), glyph: 'swords', slots: fill(size - 1, depth + 1) };
    return key(made);
  });
  return { slots: fill(size, 0) };
}

describe("the Keys screen's grid", () => {
  it('reads a grid it wrote as it was, every kind of key in it', () => {
    const layout: GmScreenLayout = {
      slots: [
        { k: 'command', command: 'stopAll' }, { k: 'mood', id: 'tavern', name: 'Tavern' }, { k: 'roll', id: 'attack', name: '' },
        { k: 'dice', formula: '2d6+3' }, { k: 'moods' }, nested('phone', MAX_FOLDER_DEPTH, [{ k: 'dice', formula: '1d20' }]),
        ...empty(GRID_SLOTS.phone - 6),
      ],
    };
    expect(parseLayout(JSON.parse(JSON.stringify(layout)), 'phone')).toEqual(layout);
  });

  it('keeps a key of a kind it does not know, field for field, through being read and written again', () => {
    const newer = { k: 'timer', seconds: 60, look: { ring: true }, label: 'Turn' };
    const read = parseLayout({ slots: [newer, folder('tablet', [newer])] }, 'tablet');
    expect(JSON.parse(JSON.stringify(read))).toEqual({ slots: [newer, folder('tablet', [newer]), ...empty(GRID_SLOTS.tablet - 2)] });
  });

  it('keeps a key of a kind it does not know up to the most a newer Atlas may write, and leaves out a larger one or one nested too deep to write', () => {
    const sized = (length: number): Record<string, unknown> => ({ k: 'macro', steps: 'x'.repeat(length - JSON.stringify({ k: 'macro', steps: '' }).length) });
    let deep: unknown = 1;
    for (let depth = 0; depth < 200_000; depth += 1) deep = [deep];
    const read = parseLayout({ slots: [sized(MAX_FOREIGN_KEY), sized(MAX_FOREIGN_KEY + 1), { k: 'macro', deep }] }, 'phone');
    expect(read?.slots.slice(0, 3)).toEqual([sized(MAX_FOREIGN_KEY), null, null]);
  });

  it('shows a device a key of a kind it does not know whole up to its limit and as its kind alone beyond, so the largest grid kept fits one message', () => {
    const newer = (length: number): Record<string, unknown> => ({ k: 'macro', steps: worst((length - JSON.stringify({ k: 'macro', steps: '' }).length) / 6) });
    const small = newer(MAX_SHOWN_FOREIGN_KEY - 4);
    const read = parseLayout({ slots: [small, newer(MAX_FOREIGN_KEY - 4), folder('phone', [newer(MAX_SHOWN_FOREIGN_KEY + 8)])] }, 'phone')!;
    const shown = shownLayout(read);
    expect(JSON.parse(JSON.stringify(shown.slots.slice(0, 3)))).toEqual([small, { k: 'macro' }, folder('phone', [{ k: 'macro' }])]);
    expect(shownLayout(shown)).toEqual(shown);
    for (const device of GM_SCREEN_DEVICES) {
      const largest = largestLayout(device);
      const heavy = (slots: readonly LayoutSlot[]): unknown[] => slots.map((slot) => (slot?.k === 'folder' ? { ...slot, slots: heavy(slot.slots) } : slot && newer(MAX_FOREIGN_KEY - 4)));
      const kept = parseLayout(JSON.parse(JSON.stringify({ slots: heavy(largest.slots) })), device)!;
      expect(layoutKeyCount(kept.slots)).toBe(MAX_LAYOUT_KEYS);
      expect(bytes({ t: 'layout', device, layout: shownLayout(kept) })).toBeLessThanOrEqual(MAX_GM_SCREEN_MESSAGE);
    }
  });

  it('makes a legal grid of anything: a slot it cannot read is empty, a folder four deep and keys past the most are left out', () => {
    const tooDeep = nested('phone', MAX_FOLDER_DEPTH + 1);
    const read = parseLayout({ slots: [{ k: 'mood', id: '' }, { k: 'command', command: 'rm -rf' }, 'x', tooDeep, ...empty(30)] }, 'phone');
    expect(read?.slots).toHaveLength(GRID_SLOTS.phone);
    expect(read?.slots.slice(0, 3)).toEqual([null, null, null]);
    expect(read?.slots[3]).toEqual(nested('phone', MAX_FOLDER_DEPTH));
    const crowded = parseLayout(JSON.parse(JSON.stringify({ slots: [nested('phone', 1, empty(0)), ...largestLayout('phone').slots] })), 'phone');
    expect(layoutKeyCount(crowded?.slots ?? [])).toBe(MAX_LAYOUT_KEYS);
    expect(parseLayout({ slots: 'all' }, 'phone')).toBeNull();
  });

  it('fits one message of Atlas at the most keys, the longest texts and the longest JSON', () => {
    for (const device of GM_SCREEN_DEVICES) {
      const layout = largestLayout(device);
      expect(layoutKeyCount(layout.slots)).toBe(MAX_LAYOUT_KEYS);
      const message = { t: 'layout', device, layout } as const;
      expect(bytes(message)).toBeLessThanOrEqual(MAX_GM_SCREEN_MESSAGE);
      expect(parseGmScreenMessage(JSON.parse(JSON.stringify(message)))).toEqual(message);
    }
  });

  it("fits every change into one message of a device, at the deepest slot and the longest texts", () => {
    for (const device of GM_SCREEN_DEVICES) {
      const deepest = [GRID_SLOTS[device] - 1, ...Array.from({ length: MAX_FOLDER_DEPTH }, () => GRID_SLOTS[device] - 2)];
      const edits = [
        { op: 'put', at: deepest, key: { k: 'mood', id: worst(MAX_KEY_TEXT) } },
        { op: 'put', at: deepest, key: { k: 'dice', formula: worst(MAX_KEY_TEXT) } },
        { op: 'put', at: deepest, key: { k: 'folder', name: worst(MAX_FOLDER_NAME), glyph: 'x'.repeat(32) } },
        { op: 'put', at: deepest, key: { k: 'command', command: 'x'.repeat(32) } },
        { op: 'move', from: deepest, to: deepest },
        { op: 'rename', at: deepest, name: worst(MAX_FOLDER_NAME), glyph: 'x'.repeat(32) },
      ];
      for (const edit of edits) {
        const message: DeviceMessage = { t: 'layout-edit', id: Number.MAX_SAFE_INTEGER, edit };
        expect(bytes(message), JSON.stringify(edit).slice(0, 40)).toBeLessThanOrEqual(MAX_DEVICE_MESSAGE);
        expect(parseLayoutEdit(edit, device), edit.op).not.toBeNull();
        expect(parseDeviceMessage(JSON.parse(JSON.stringify(message)))).toEqual(message);
      }
    }
  });

  it('reads no change with a place outside its grid, a path below the deepest folder, or a key a device cannot choose', () => {
    expect(parseLayoutEdit({ op: 'remove', at: [GRID_SLOTS.phone] }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'remove', at: [GRID_SLOTS.phone - 1] }, 'phone')).not.toBeNull();
    expect(parseLayoutEdit({ op: 'remove', at: [0, GRID_SLOTS.phone - 1] }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'remove', at: [GRID_SLOTS.phone] }, 'tablet')).not.toBeNull();
    expect(parseLayoutEdit({ op: 'remove', at: [0, 0, 0, 0, 0] }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'remove', at: [] }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'remove', at: [0.5] }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'put', at: [0], key: { k: 'timer', seconds: 5 } }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'put', at: [0], key: { k: 'dice', formula: '1d6'.repeat(70) } }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'put', at: [0], key: { k: 'folder', name: '  ', glyph: 'skull' } }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'put', at: [0], key: { k: 'folder', name: 'x'.repeat(MAX_FOLDER_NAME + 1), glyph: 'skull' } }, 'phone')).toBeNull();
    expect(parseLayoutEdit({ op: 'empty' }, 'phone')).toBeNull();
  });

  it('reads a device that names no kind Atlas knows as no message, and a change without an id as none', () => {
    expect(parseDeviceMessage({ t: 'layout-ask', device: 'phone' })).toEqual({ t: 'layout-ask', device: 'phone' });
    expect(parseDeviceMessage({ t: 'layout-ask', device: 'watch' })).toBeNull();
    expect(parseDeviceMessage({ t: 'layout-edit', edit: { op: 'remove', at: [0] } })).toBeNull();
    expect(parseDeviceMessage({ t: 'layout-edit', id: 1, edit: 'remove' })).toBeNull();
    expect(parseGmScreenMessage({ t: 'layout-answer', id: 1, refused: 'Too deep!' })).toBeNull();
  });
});
