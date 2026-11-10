import React from 'react';
import type { App } from 'obsidian';
import type { StatblockTemplate } from '../../model/templateTypes';
import type { FieldRecord } from '../../values/fieldValues';
import { ItemPreview } from '../template-editor/ItemPreview';
import { SoloBlock } from '../template-editor/SoloBlock';
import type { DragSource } from './dragSources';

/** The width of a tile standing alone in a row of the card: its column's; null where the card holds none to measure. */
export function cardTileWidth(stage: HTMLElement): number | null {
  const columns = stage.querySelector<HTMLElement>('.atlas-sb-columns');
  const tile = columns?.querySelector<HTMLElement>(':scope > .atlas-sb-item:not([data-block="row"])');
  const width = (tile ?? columns)?.getBoundingClientRect().width ?? 0;
  return width > 0 ? width : null;
}

type FaceStyle = React.CSSProperties & Record<`--${string}`, string>;

export interface DragPreviewProps {
  source: DragSource;
  template: StatblockTemplate;
  record: FieldRecord;
  app: App | undefined;
  sourcePath: string | undefined;
  /** How wide a tile of the card is: a kind from the dock is drawn at that width, as it will stand on the card. */
  tileWidth: number | null;
}

/**
 * What moves under the pointer (§7.6): the block's own rendering at the width
 * dnd-kit gives the overlay (its frame's), or the tile a kind from the dock
 * places, drawn as it looks on the card before it is named and at a tile's width.
 */
export function DragPreview({ source, template, record, app, sourcePath, tileWidth }: DragPreviewProps): React.JSX.Element | null {
  switch (source.kind) {
    case 'block': return <SoloBlock template={template} id={source.id} record={record} app={app} sourcePath={sourcePath} className="atlas-te-drag-sheet" />;
    case 'item': {
      const style: FaceStyle | undefined = tileWidth ? { '--atlas-te-tile-width': `${tileWidth}px` } : undefined;
      return <div className="atlas-te-drag-face--item" style={style}><ItemPreview item={source.item} app={app} className="atlas-te-drag-sheet" /></div>;
    }
  }
}
