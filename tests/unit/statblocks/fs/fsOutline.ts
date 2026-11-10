/**
 * A template's blocks as one line each, indented by nesting: the shape the
 * converter's golden tests compare block by block. Ids are left out.
 */

import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';

type Shown = string | number | boolean | undefined;

function part(name: string, value: Shown): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? ` ${name}=${JSON.stringify(value)}` : ` ${name}=${String(value)}`;
}

function bound(block: TemplateBlock): string {
  switch (block.type) {
    case 'section': return part('heading', block.heading) + part('headingField', block.headingField) + part('collapsible', block.collapsible);
    case 'row': return part('align', block.align);
    case 'title': return ` ${block.field}` + part('level', block.level) + part('pattern', block.pattern);
    case 'line': return ` ${block.fields.join(',')}` + part('separator', block.separator) + part('pattern', block.pattern);
    case 'stat': return ` ${block.field}` + part('label', block.label) + part('pattern', block.pattern) + part('display', block.display) + part('rollFrom', block.rollFrom);
    case 'scores': return ` ${block.field}` + (block.columns ?? []).map((column) => part('column', column.formula)).join('');
    case 'pairs': return ` ${block.field}` + part('label', block.label) + part('display', block.display);
    case 'entries': return ` ${block.field}` + part('heading', block.heading);
    case 'spells': return ` ${block.field}` + part('heading', block.heading);
    case 'text': return (block.field ? ` ${block.field}` : '') + part('text', block.text) + part('heading', block.heading);
    case 'image': return ` ${block.field}`;
    case 'track': return ` ${block.field}` + part('counts', block.counts);
    case 'script': return part('summary', block.summary);
    case 'heading': return part('text', block.text) + part('level', block.level);
    default: return '';
  }
}

function flags(block: TemplateBlock): string {
  const when = block.showWhen ? ` when ${block.showWhen.field} ${block.showWhen.is}` : '';
  const extras = block.fsExtras ? ` extras=${Object.keys(block.fsExtras).sort().join(',')}` : '';
  return when + part('whenEmpty', block.whenEmpty) + part('fallback', block.fallback) + part('cls', block.className) + extras;
}

export function outline(blocks: readonly TemplateBlock[], depth = 0): string[] {
  return blocks.flatMap((block) => [
    `${'  '.repeat(depth)}${block.type}${bound(block)}${flags(block)}`,
    ...(block.type === 'section' || block.type === 'row' ? outline(block.blocks, depth + 1) : []),
  ]);
}

export function fieldOutline(fields: readonly TemplateField[]): string[] {
  return fields.map((field) => {
    const slots = field.slots ? ` [${field.slots.join(',')}]` : '';
    const entry = field.entry?.textKey ? ` text=${field.entry.textKey}` : '';
    return `${field.key}: ${field.type} "${field.label}"${slots}${entry}`;
  });
}
