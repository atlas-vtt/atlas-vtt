import type { AbilityComponent, BookStatblock, SheetNode, SheetValue } from '../../../../../src/app/online/protocol/index.ts';
import type { ResolvedStatblock, TemplateStatus } from '../../../../../src/app/statblocks/model/resolvedTypes';
import type { StatblockTemplate } from '../../../../../src/app/statblocks/model/templateTypes';
import { valueText } from '../../../../../src/app/statblocks/values/valueText';

/** A native note of `template` holding `fields`, as the resolver reads it. */
export function resolvedOf(template: StatblockTemplate, fields: Record<string, unknown>, templateStatus: TemplateStatus = 'ok'): ResolvedStatblock {
  return { path: 'Characters/Ana.md', source: { kind: 'atlas', templateId: template.id }, fields, template, templateStatus, lookName: 'Test', meanings: {} };
}

function valueTexts(value: SheetValue): string[] {
  return [value.label ?? '', value.text.opening, ...(value.words ?? []), ...(value.pairs ?? []).flatMap((pair) => [pair.label, pair.value])];
}

function nodeTexts(node: SheetNode): string[] {
  switch (node.k) {
    case 'section': return [node.heading ?? '', ...node.nodes.flatMap(nodeTexts)];
    case 'row': return node.nodes.flatMap(nodeTexts);
    case 'tabs': return [node.heading ?? '', ...node.tabs.flatMap((tab) => [tab.label, ...tab.nodes.flatMap(nodeTexts)])];
    case 'heading': return [node.text];
    case 'value': return valueTexts(node.value);
    case 'metric': return [node.heading ?? '', ...node.values.flatMap(valueTexts)];
    case 'table': return [node.label ?? '', ...node.columns, ...node.rows.flat(), ...node.worked.flat(), ...(node.workedLabels ?? [])].map((cell) => cell ?? '');
    case 'track': return [node.label ?? '', `${node.current}`, `${node.max}`];
    case 'divider': return [];
  }
}

function componentTexts(component: AbilityComponent, names: boolean): string[] {
  const labels = new Map(component.parts.map((part) => [part.key, part.label]));
  return [names ? component.name : '', ...component.tabs.flatMap((tab) => [tab.label ?? '', tab.intro?.opening ?? '', ...tab.entries.flatMap((entry) => [
    entry.name, entry.text.opening, ...Object.entries(entry.parts).flatMap(([key, part]) => [labels.get(key) ?? '', valueText(part as never)]),
  ])])];
}

/**
 * Every text a drawn statblock shows a player. Without `names`, the names the page gives what the
 * card shows without one (a sigil's label, an Abilities component named after its property) are
 * left out.
 */
export function statblockTexts(statblock: BookStatblock, names = true): string[] {
  const sigils = Object.values(statblock.sigils).flatMap((sigil) => valueTexts(names ? sigil : { ...sigil, label: null }));
  return [statblock.displayName ?? '', ...sigils, ...statblock.blocks.flatMap(nodeTexts), ...statblock.abilities.flatMap((component) => componentTexts(component, names))];
}

/** The words of texts, without Markdown marks or case: what a reader reads. */
export function wordsOf(texts: readonly string[]): Set<string> {
  return new Set(texts.join(' ').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}
