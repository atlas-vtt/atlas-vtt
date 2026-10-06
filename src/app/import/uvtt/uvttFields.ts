import { isFiniteNumber, isRecord } from '../../utils/guards';
import { UVTT_LIMITS, type UvttPoint } from './uvttTypes';

/**
 * Readers for single fields of a Universal VTT file. A field the import places things by that is
 * missing, of the wrong type or out of range ends the reading with `UvttFormatError`, whose
 * message is a sentence naming the field in plain words; `parseUvtt` turns it into its result.
 * What only colours or switches something falls back to its default instead.
 */
export class UvttFormatError extends Error {}

export function refuse(problem: string): never {
  throw new UvttFormatError(problem);
}

/** A field a file may leave out or set to null. */
export function isAbsent(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** A field as the object itself holds it; what an object inherits is not the file's. */
export function own(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function readRecord(value: unknown, what: string): Record<string, unknown> {
  return isRecord(value) ? value : refuse(`${what} is missing or not an object.`);
}

/** An optional list: absent reads as empty, and it may hold at most `limit` entries. */
export function readList(value: unknown, what: string, limit: number, limitProblem: string): unknown[] {
  if (isAbsent(value)) return [];
  if (!Array.isArray(value)) return refuse(`${what} is not a list.`);
  return value.length > limit ? refuse(limitProblem) : value;
}

export function readNumber(value: unknown, what: string, min: number, max: number): number {
  if (!isFiniteNumber(value)) return refuse(`${what} is missing or not a number.`);
  return value < min || value > max ? refuse(`${what} is out of range.`) : value;
}

/** A position in cells, within `UVTT_LIMITS.distance` of zero on both axes. */
export function readPoint(value: unknown, what: string): UvttPoint {
  if (!isRecord(value)) return refuse(`${what} is missing or not a position.`);
  const { distance } = UVTT_LIMITS;
  return {
    x: readNumber(own(value, 'x'), `${what} (x)`, -distance, distance),
    y: readNumber(own(value, 'y'), `${what} (y)`, -distance, distance),
  };
}

/**
 * A yes or no, however an exporter writes it: `true`, `1` and `"true"` are yes, `false`, `0`,
 * `"false"`, `"0"` and `""` are no, and anything else, or nothing, is `fallback`.
 */
export function readFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return !['', '0', 'false'].includes(value.trim().toLowerCase());
  return fallback;
}

const COLOR = /^#?(?:[0-9a-f]{2})?([0-9a-f]{6})$/i;

/** A colour written as `aarrggbb` or `rrggbb`, as `#rrggbb` (the alpha is dropped); null for anything else. */
export function readColor(value: unknown): string | null {
  const match = typeof value === 'string' ? COLOR.exec(value.trim()) : null;
  return match?.[1] ? `#${match[1].toLowerCase()}` : null;
}
