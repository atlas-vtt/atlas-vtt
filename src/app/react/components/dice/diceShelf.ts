/**
 * The dice tray's shelf: the rolls a collection saved (`dicePresets`) and the row of the tray (`diceRow`): dice
 * of any size and saved rolls, in the order the GM put them. Settings arrive from vault files, so they are read
 * here and nowhere else; every change returns the settings to write, field by field.
 */

import type { CollectionSettings } from '../../../types/collectionSettingsTypes';
import type { DicePreset, DiceRowSlot } from '../../../types/dicePresetTypes';
import { FORMULA_LIMITS } from '../../../tools/parseFormula';
import { TRAY_DICE } from './diceTrayPool';
import { readPresetLook } from './presetLook';

/** Places in the row: the number keys 1 to 9, then 0. */
export const MAX_ROW = 10;
export const MAX_PRESETS = 40;
export const MAX_PRESET_NAME = 40;
/** Faces a die of the row may have: what a formula may roll. */
export const MIN_FACES = 2;

export const STANDARD_ROW: readonly DiceRowSlot[] = TRAY_DICE.map((sides): DiceRowSlot => ({ kind: 'die', sides }));

export interface DiceShelf {
  presets: readonly DicePreset[];
  row: readonly DiceRowSlot[];
  /** Whether the row is the collection's own (`diceRow`) or the standard dice. */
  ownRow: boolean;
}

export type ShelfChange = Pick<CollectionSettings, 'dicePresets' | 'diceRow'>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const own = (record: Record<string, unknown>, key: string): unknown => (Object.hasOwn(record, key) ? record[key] : undefined);

export const isDieSize = (sides: unknown): sides is number =>
  typeof sides === 'number' && Number.isInteger(sides) && sides >= MIN_FACES && sides <= FORMULA_LIMITS.faces;

/** A saved roll as settings hold it: a formula, or designed dice (`look`) with a bonus; null where it is neither. */
function readPreset(raw: unknown): DicePreset | null {
  if (!isRecord(raw)) return null;
  const [id, name, formula] = [own(raw, 'id'), own(raw, 'name'), own(raw, 'formula')];
  if (typeof id !== 'string' || id === '' || id.length > 64) return null;
  if (typeof name !== 'string' || name.trim() === '' || name.length > MAX_PRESET_NAME) return null;
  if (typeof formula !== 'string' || formula.length > FORMULA_LIMITS.characters) return null;
  const base = { id, name: name.trim(), formula: formula.trim() };
  if (own(raw, 'look') !== undefined) {
    const look = readPresetLook(own(raw, 'look'), base.formula);
    if (look) return { ...base, look };
  }
  return base.formula === '' || readsAsBonus(base.formula) ? null : base;
}

/** A look that could not be read leaves a bonus alone, which is no roll of its own. */
const readsAsBonus = (formula: string): boolean => /^[+-]\d+$/.test(formula);

function readSlot(raw: unknown, presets: readonly DicePreset[]): DiceRowSlot | null {
  if (!isRecord(raw)) return null;
  const kind = own(raw, 'kind');
  if (kind === 'die') {
    const sides = own(raw, 'sides');
    return isDieSize(sides) ? { kind, sides } : null;
  }
  const id = own(raw, 'id');
  return kind === 'preset' && presets.some((preset) => preset.id === id) ? { kind, id: id as string } : null;
}

/** Whether two places of the row stand for the same die or roll. */
export const sameSlot = (a: DiceRowSlot, b: DiceRowSlot): boolean =>
  a.kind === 'die' ? b.kind === 'die' && a.sides === b.sides : b.kind === 'preset' && a.id === b.id;

/** The shelf as settings hold it: entries that cannot be used, repeats and anything past the limits are left out. */
export function readDiceShelf(settings: Pick<CollectionSettings, 'dicePresets' | 'diceRow'> | null | undefined): DiceShelf {
  const presets: DicePreset[] = [];
  for (const raw of Array.isArray(settings?.dicePresets) ? settings.dicePresets : []) {
    const preset = readPreset(raw);
    if (preset && !presets.some((kept) => kept.id === preset.id)) presets.push(preset);
    if (presets.length === MAX_PRESETS) break;
  }
  if (!Array.isArray(settings?.diceRow)) return { presets, row: STANDARD_ROW, ownRow: false };
  const row: DiceRowSlot[] = [];
  for (const raw of settings.diceRow) {
    const slot = readSlot(raw, presets);
    if (slot && !row.some((kept) => sameSlot(kept, slot))) row.push(slot);
    if (row.length === MAX_ROW) break;
  }
  return { presets, row, ownRow: true };
}

/** A new saved roll; its formula as it was written, or designed dice where `look` says them. */
export function newPreset(name: string, formula: string, look?: DicePreset['look'], id: string = crypto.randomUUID()): DicePreset {
  return { id, name: name.trim().slice(0, MAX_PRESET_NAME), formula: formula.trim(), ...(look && { look }) };
}

/** The shelf with a new roll saved; null where it holds as many as it may. */
export function withSavedPreset(shelf: DiceShelf, preset: DicePreset): ShelfChange | null {
  if (shelf.presets.length >= MAX_PRESETS) return null;
  return { dicePresets: [...shelf.presets, preset] };
}

/** The shelf with a saved roll changed in its place. */
export function withPresetReplaced(shelf: DiceShelf, preset: DicePreset): ShelfChange {
  return { dicePresets: shelf.presets.map((kept) => (kept.id === preset.id ? preset : kept)) };
}

/** The shelf without a saved roll, and the row without its place. */
export function withoutPreset(shelf: DiceShelf, id: string): ShelfChange {
  const change: ShelfChange = { dicePresets: shelf.presets.filter((preset) => preset.id !== id) };
  const row = shelf.row.filter((slot) => !(slot.kind === 'preset' && slot.id === id));
  return row.length === shelf.row.length ? change : { ...change, diceRow: row };
}

/** A saved roll put in the row (at its end) or taken out of it; null where the row is full. */
export function withPinToggled(shelf: DiceShelf, id: string): ShelfChange | null {
  const slot: DiceRowSlot = { kind: 'preset', id };
  if (shelf.row.some((kept) => sameSlot(kept, slot))) return { diceRow: shelf.row.filter((kept) => !sameSlot(kept, slot)) };
  return shelf.row.length < MAX_ROW ? { diceRow: [...shelf.row, slot] } : null;
}

/** The row with a die of `sides` faces at its end; null where it has one or is full. */
export function withRowDie(shelf: DiceShelf, sides: number): ShelfChange | null {
  const slot: DiceRowSlot = { kind: 'die', sides };
  if (!isDieSize(sides) || shelf.row.length >= MAX_ROW || shelf.row.some((kept) => sameSlot(kept, slot))) return null;
  return { diceRow: [...shelf.row, slot] };
}

export function withoutRowSlot(shelf: DiceShelf, index: number): ShelfChange {
  return { diceRow: shelf.row.filter((_, at) => at !== index) };
}

/** The row with the place at `from` moved to `to`. */
export function withRowSlotMoved(shelf: DiceShelf, from: number, to: number): ShelfChange | null {
  if (from === to || from < 0 || to < 0 || from >= shelf.row.length || to >= shelf.row.length) return null;
  const row = [...shelf.row];
  const [moved] = row.splice(from, 1);
  row.splice(to, 0, moved!);
  return { diceRow: row };
}

/** The standard seven dice again. */
export const STANDARD_ROW_CHANGE: ShelfChange = { diceRow: undefined };

/** Why a die typed for the row cannot join it. */
export type RowDieProblem = 'not-a-die' | 'faces' | 'present' | 'full';

/** The die a GM types for the row (`d12`, `12`, `d%`) and whether it can join; `sides` null where it is none. */
export function typedRowDie(shelf: DiceShelf, text: string): { sides: number | null; problem: RowDieProblem | null } {
  const match = /^\s*d?(\d{1,4}|%)\s*$/i.exec(text);
  if (!match) return { sides: null, problem: 'not-a-die' };
  const sides = match[1] === '%' ? 100 : Number(match[1]);
  if (!isDieSize(sides)) return { sides, problem: 'faces' };
  if (shelf.row.some((slot) => sameSlot(slot, { kind: 'die', sides }))) return { sides, problem: 'present' };
  return { sides, problem: shelf.row.length >= MAX_ROW ? 'full' : null };
}
