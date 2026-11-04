// SPDX-License-Identifier: AGPL-3.0-only

/** The parts every built-in template shares: its file header, the name and portrait fields, common blocks. */

import {
  TEMPLATE_FORMAT,
  TEMPLATE_VERSION,
  type BuiltInTemplate,
  type BuiltInTemplateId,
  type HeaderPartId,
  type StatBlock,
  type StatblockTemplate,
  type TableAlign,
  type TemplateField,
  type TemplateHeader,
} from '../model/templateTypes';

type TemplateBody = Omit<StatblockTemplate, 'format' | 'version' | 'id'>;

/** A built-in: its name, its revision, and its template under its own id. */
export function builtIn(id: BuiltInTemplateId, name: string, revision: number, body: TemplateBody): BuiltInTemplate {
  return { id, name, revision, template: { format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id, ...body } };
}

/** A row of numbers (ability scores) stands centred under its column names: `align` for `count` columns. */
export function centredColumns(count: number): TableAlign[] {
  return Array.from({ length: count }, () => 'center');
}

export function nameField(): TemplateField {
  return { key: 'name', label: 'Name', type: 'text' };
}

export function portraitField(): TemplateField {
  return { key: 'image', label: 'Portrait', type: 'image' };
}

/** The flavour text under the name in the header. */
export function descriptionField(): TemplateField {
  return { key: 'description', label: 'Description', type: 'markdown' };
}

/** Size words most systems share; `open`, so a system's own sizes ("1M", "Colossal") fit too. */
export function sizeField(): TemplateField {
  return {
    key: 'size', label: 'Size', type: 'choice', options: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'],
    open: true, meaning: 'size',
  };
}

/** The parts of the header (`templateHeader.ts`) a system has no use for: kept in the template, off the card. */
export function hiddenParts(...parts: HeaderPartId[]): { header: TemplateHeader } {
  return { header: { hidden: parts } };
}

export function runInStat(id: string, field: string): StatBlock {
  return { id, type: 'stat', field, look: 'run-in' };
}

export function stackedStat(id: string, field: string): StatBlock {
  return { id, type: 'stat', field, look: 'stacked' };
}

/** Freezes a built-in and everything in it: built-ins are read-only, and every reader shares one copy. */
export function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) frozen(inner);
  }
  return value;
}
