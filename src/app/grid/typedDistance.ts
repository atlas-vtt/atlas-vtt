const DECIMAL = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * What a distance field holds: `undefined` when empty, null when it is no positive number.
 * A comma and a point are both the decimal sign, whatever the system writes.
 */
export function typedDistance(text: string): number | undefined | null {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (!DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return value > 0 ? value : null;
}
