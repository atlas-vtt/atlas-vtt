import React from 'react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { isExpressionError, nameOf, type LabelResolver } from '../../expressions/errors';
import { formulaText } from '../../expressions/formulaText';
import { parsePatternCached } from '../../expressions/patternParse';
import type { PatternNode } from '../../expressions/patternTypes';
import { t } from '../../../i18n';

function nodesInWords(nodes: readonly PatternNode[], labelOf: LabelResolver | undefined): string {
  return nodes.map((node) => {
    switch (node.kind) {
      case 'text': return node.text;
      case 'refs': return node.refs.map((ref) => nameOf(ref, labelOf)).join(', ');
      case 'formula': return formulaText(node.formula, labelOf);
      case 'optional': return nodesInWords(node.nodes, labelOf);
    }
  }).join('').trim();
}

/** Whether a pattern reads a property or works something out, rather than being plain text ("—"). */
function derives(nodes: readonly PatternNode[]): boolean {
  return nodes.some((node) => node.kind === 'refs' || node.kind === 'formula' || (node.kind === 'optional' && derives(node.nodes)));
}

/**
 * A fallback as a reader says it: properties by their labels, formulas
 * written out ("floor((Dex - 10) / 2)"); null for plain text, which needs no
 * saying, and for a pattern that does not parse.
 */
export function patternInWords(pattern: string, labelOf: LabelResolver | undefined): string | null {
  const ast = parsePatternCached(pattern);
  if (isExpressionError(ast) || !derives(ast.nodes)) return null;
  return nodesInWords(ast.nodes, labelOf) || null;
}

/**
 * A value the template works out while its own property is empty (§6.3): it
 * looks as the card draws it, with no mark of its own; pointing at it says
 * how it is worked out. Typing a value of its own replaces it.
 */
export function DerivedValue({ words, children }: { words: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <LabelTooltip label={t('statblockEditor.derivedFrom', { list: words })} multiline>
      <span className="atlas-sb-pane-derived">{children}</span>
    </LabelTooltip>
  );
}
