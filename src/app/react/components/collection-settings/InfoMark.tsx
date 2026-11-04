import React from 'react';
import { Info } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';

/**
 * The info mark beside a setting: its tooltip says what the setting does, so
 * the setting itself stays one compact row.
 */
export function InfoMark({ label }: { label: string }): React.ReactElement {
  return (
    <LabelTooltip label={label} multiline>
      {/* Focusable, so the explanation also opens from the keyboard. */}
      <span className="atlas-csm-info" role="img" tabIndex={0}>
        <Info size={14} aria-hidden="true" />
      </span>
    </LabelTooltip>
  );
}
