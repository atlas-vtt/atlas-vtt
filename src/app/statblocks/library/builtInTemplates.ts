/** The templates built into Atlas, read-only, looked up by id, each with a field for every part of its header (`templateHeader.ts`). */

import { withHeader } from '../model/headerDuplicates';
import type { BuiltInTemplate } from '../model/templateTypes';
import { BUILT_IN_TEMPLATES } from '../presets';
import { frozen } from '../presets/presetParts';

const READ: readonly BuiltInTemplate[] = frozen(BUILT_IN_TEMPLATES.map((builtIn) => ({ ...builtIn, template: withHeader(builtIn.template) })));

const BY_ID: ReadonlyMap<string, BuiltInTemplate> = new Map(READ.map((builtIn) => [builtIn.id, builtIn]));

/** Every built-in, in the order pickers list them. Frozen: copy before editing. */
export function allBuiltInTemplates(): readonly BuiltInTemplate[] {
  return READ;
}

/** The built-in with this id, or null when Atlas has none by that id. */
export function builtInTemplate(id: string): BuiltInTemplate | null {
  return BY_ID.get(id) ?? null;
}
