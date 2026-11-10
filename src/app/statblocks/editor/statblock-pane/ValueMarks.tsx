import React from 'react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

/**
 * A value kept as typed though it does not fit its field's type ("1/4" in a
 * number field): a small dot after it, whose tooltip says why (§8.1, invariant 4).
 */
export function WarningDot({ problem }: { problem: string }): React.JSX.Element {
  return (
    <LabelTooltip label={problem} multiline>
      <span className="atlas-sb-pane-warning" role="img" tabIndex={0} />
    </LabelTooltip>
  );
}
