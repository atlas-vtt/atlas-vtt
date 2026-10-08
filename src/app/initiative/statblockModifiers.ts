import { resolveField } from '../resources/resourceFields';

/** A signed, finite integer modifier; never evaluates a dice expression or other code. */
function numericModifier(value: unknown): number | null {
  if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) value = Number(value.trim());
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

/** Reads the configured field, or the usual names in order. Missing or invalid modifiers are zero. */
export function statblockInitiativeModifier(record: Readonly<Record<string, unknown>>, field?: string): number {
  const paths = field?.trim() ? [field.trim()] : ['modifier', 'initiative'];
  for (const path of paths) {
    const modifier = numericModifier(resolveField(record, path));
    if (modifier !== null) return modifier;
  }
  return 0;
}
