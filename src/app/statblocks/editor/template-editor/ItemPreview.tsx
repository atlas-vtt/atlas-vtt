import React, { useMemo } from 'react';
import type { App } from 'obsidian';
import { previewTemplate, type InsertItem } from './insertItems';
import { SoloBlock } from './SoloBlock';

/** A kind drawn as the tile it places looks before it is named: the insert menu's preview and what a drag from the dock carries. */
export function ItemPreview({ item, app, className }: { item: InsertItem; app?: App | undefined; className?: string | undefined }): React.JSX.Element {
  const template = useMemo(() => previewTemplate(item), [item]);
  return (
    <div className="atlas-te-item-preview" aria-hidden="true" inert>
      <SoloBlock template={template} id={template.layout.blocks[0]?.id ?? ''} app={app} className={className} />
    </div>
  );
}
