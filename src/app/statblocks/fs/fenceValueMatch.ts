/**
 * Whether a note's property already says what its ```statblock fence says
 * (§6.4). Both are YAML a person typed, and Obsidian writes a number into a
 * text property as `"3"`: the same value written another way is the same
 * value, so the note keeps its own spelling and nothing is in the way of the
 * move. Pure.
 */

import type { FieldValue } from '../model/templateTypes';
import { isFieldMap } from '../notes/listIdentity';

type Scalar = string | number | boolean;

function isScalar(value: FieldValue | undefined): value is Scalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Text without the blanks around it; a number or a switch written as text is that number or switch. */
function sameScalar(a: Scalar, b: Scalar): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  if (typeof a !== 'string' && typeof b !== 'string') return a === b;
  const [text, other] = typeof a === 'string' ? [a.trim(), b] : [String(b).trim(), a];
  if (typeof other === 'number') return text !== '' && Number(text) === other;
  return text.toLowerCase() === String(other);
}

/** A property that is there without a value (`level:`, `level: ""`): the statblock's value fills it. */
export function holdsNothing(value: FieldValue): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

/** Whether the two say the same: lists item by item in order, maps key by key in any order. */
export function sameStatblockValue(held: FieldValue | undefined, fence: FieldValue | undefined): boolean {
  if (isScalar(held) && isScalar(fence)) return sameScalar(held, fence);
  if (Array.isArray(held) && Array.isArray(fence)) {
    return held.length === fence.length && held.every((item, index) => sameStatblockValue(item, fence[index]));
  }
  if (isFieldMap(held) && isFieldMap(fence)) {
    const keys = Object.keys(held);
    return keys.length === Object.keys(fence).length
      && keys.every((key) => Object.prototype.hasOwnProperty.call(fence, key) && sameStatblockValue(held[key], fence[key]));
  }
  return held === fence;
}
