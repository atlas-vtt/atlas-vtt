import type { Json } from './types/common';

/** `value` as a copy in plain JSON, or a clear error naming `call` (e.g. `scenes.setData`). */
export function plainJson(call: string, value: unknown): Json {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    throw new Error(`[Atlas API] ${call}: the value must be plain JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (text === undefined) throw new Error(`[Atlas API] ${call}: the value must be plain JSON, or null to clear it.`);
  return JSON.parse(text) as Json;
}
