import React from 'react';
import type { HeadingBlock } from '../../model/templateTypes';
import { SheetHeading } from '../values/SheetHeading';
import type { BlockViewProps } from './blockViewProps';

/** Static heading text ("Actions"), a section's or a minor one. */
export function HeadingView({ block }: BlockViewProps<HeadingBlock>): React.JSX.Element {
  return <SheetHeading minor={block.level === 'minor'}>{block.text}</SheetHeading>;
}
