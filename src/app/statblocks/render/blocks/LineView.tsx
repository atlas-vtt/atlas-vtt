import React from 'react';
import type { LineBlock } from '../../model/templateTypes';
import { DisplayText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

/** The muted italic line under a title: "Large plant, unaligned". */
export function LineView({ block, display }: BlockViewProps<LineBlock>): React.JSX.Element {
  return (
    <div className="atlas-sb-line">
      <ValueSlot block={block}><DisplayText display={display} /></ValueSlot>
    </div>
  );
}
