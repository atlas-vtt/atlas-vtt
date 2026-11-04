import React from 'react';
import { CircleAlert } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { ExpressionError } from '../../expressions/errors';

/**
 * A muted mark where a pattern or formula of the template went wrong (it
 * cannot be read, or a value is not a number); its tooltip says why in plain
 * words. Empty fields never get one.
 */
export function ProblemMarker({ problems }: { problems: readonly ExpressionError[] }): React.JSX.Element | null {
  const message = [...new Set(problems.map((problem) => problem.message))].join(' ');
  if (!message) return null;

  return (
    <LabelTooltip label={message} multiline>
      <span className="atlas-sb-problem" role="img" tabIndex={0}>
        <CircleAlert aria-hidden="true" />
      </span>
    </LabelTooltip>
  );
}
