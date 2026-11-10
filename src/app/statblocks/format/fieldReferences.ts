/** Blocks that name a field the template does not define. They stay; the problem only says so. */

import { fieldsShownBy } from '../model/treeQueries';
import { isContainerBlock, type StatblockTemplate, type TemplateBlock } from '../model/templateTypes';
import { describeValue } from './jsonValues';

/**
 * The field keys a block names directly, its condition included; patterns are
 * the expression language's, and unbound references ('') name nothing.
 */
function namedFields(block: TemplateBlock): string[] {
  if (block.type === 'opaque') return [];
  const shown = fieldsShownBy(block);
  return block.showWhen?.field ? [...new Set([...shown, block.showWhen.field])] : shown;
}

export function danglingFieldProblems(template: StatblockTemplate): string[] {
  const keys = new Set(template.fields.map((field) => field.key));
  const problems: string[] = [];
  const visit = (blocks: readonly TemplateBlock[], path: readonly number[]): void => {
    blocks.forEach((block, index) => {
      const at = [...path, index + 1];
      for (const key of namedFields(block).filter((named) => !keys.has(named))) {
        problems.push(`Block ${at.join('.')} (${block.type}) names the field ${describeValue(key)}, which the template does not define.`);
      }
      if (isContainerBlock(block)) visit(block.blocks, at);
    });
  };
  visit(template.layout.blocks, []);
  return problems;
}
