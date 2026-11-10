import React from 'react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { ValueMisfit } from '../../values/valueFit';

/**
 * A value that does not fit its field's type, shown as it is written (§8.8):
 * a small chip after it ("Not a number") whose tooltip says why.
 */
export function MisfitChip({ misfit }: { misfit: ValueMisfit }): React.JSX.Element {
  return (
    <LabelTooltip label={misfit.problem} multiline describe>
      <span className="atlas-sb-misfit" tabIndex={0}>{misfit.label}</span>
    </LabelTooltip>
  );
}
