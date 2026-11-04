import React from 'react';
import type { RowBlock } from '../../model/templateTypes';
import type { BlockViewProps } from './blockViewProps';

interface RowViewProps extends BlockViewProps<RowBlock> {
  children: React.ReactNode;
}

/** Blocks side by side that wrap where the width runs out; `fill` children share the free width. */
export function RowView({ block, children }: RowViewProps): React.JSX.Element {
  return <div className="atlas-sb-row" data-align={block.align ?? 'start'}>{children}</div>;
}
