import React from 'react';
import type { TitleBlock } from '../../model/templateTypes';
import { DisplayText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

const HEADING_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;

/** The statblock's name or another headline, in the theme's heading face. */
export function TitleView({ block, display }: BlockViewProps<TitleBlock>): React.JSX.Element {
  const Heading = HEADING_TAGS[block.level] ?? 'h1';
  return (
    <Heading className="atlas-sb-heading" data-level={block.level}>
      <ValueSlot block={block}><DisplayText display={display} /></ValueSlot>
    </Heading>
  );
}
