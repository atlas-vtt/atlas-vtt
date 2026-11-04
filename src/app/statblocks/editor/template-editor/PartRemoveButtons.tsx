import React, { useLayoutEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { METRIC_INDEX_ATTRIBUTE } from '../../render/blocks/MetricView';
import type { StatblockTemplate } from '../../model/templateTypes';
import { chromeButtonProps } from '../interaction/chrome';
import { boxIn } from './canvasGaps';
import { blockFrame } from './editorChrome';
import type { Box } from './gapGeometry';
import type { ChromeStyle } from './LabelEditor';
import { tilePartsOf } from './tileParts';
import { t } from '../../../i18n';

export interface PartRemoveButtonsProps {
  stage: HTMLElement;
  template: StatblockTemplate;
  /** The tiles whose numbers show their ×: the selected one and the one pointed at. */
  blockIds: readonly string[];
  /** Whatever moves the card's blocks: measured again when it changes. */
  revision: unknown;
  onRemove: (blockId: string, index: number) => void;
}

interface PartBox {
  blockId: string;
  index: number;
  box: Box;
}

function union(a: Box, b: Box): Box {
  return { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
}

/** The numbers of the Metric `blockId` as the card draws them, in the stage's coordinates: each number's elements as one box. */
function partBoxes(stage: HTMLElement, blockId: string): PartBox[] {
  const frame = blockFrame(stage, blockId);
  if (!frame) return [];
  const attribute = METRIC_INDEX_ATTRIBUTE;
  const boxes = new Map<number, Box>();
  for (const element of frame.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
    const index = Number(element.getAttribute(attribute));
    if (element.closest('[data-block-id]') !== frame || !Number.isInteger(index)) continue;
    const box = boxIn(stage, element);
    const known = boxes.get(index);
    boxes.set(index, known ? union(known, box) : box);
  }
  return [...boxes].sort(([a], [b]) => a - b).map(([index, box]) => ({ blockId, index, box }));
}

/** Where a part's × stands: on its box's top right corner, where a Metric's rule to the next number starts. */
function cornerStyle(box: Box): ChromeStyle {
  return { '--atlas-te-x': `${box.right}px`, '--atlas-te-y': `${box.top}px` };
}

function sameBoxes(a: readonly PartBox[], b: readonly PartBox[]): boolean {
  return a.length === b.length && a.every((each, at) => {
    const other = b[at];
    return other !== undefined && other.blockId === each.blockId && other.index === each.index
      && other.box.left === each.box.left && other.box.top === each.box.top && other.box.right === each.box.right && other.box.bottom === each.box.bottom;
  });
}

/**
 * A small × at the top corner of each number of a Metric while the tile is
 * selected or pointed at, which takes that number out; its last number goes
 * only with the tile. Chrome: out of the tab
 * order, focus stays where it is; the tile's menu has the same Remove rows
 * for the keyboard.
 */
export function PartRemoveButtons({ stage, template, blockIds, revision, onRemove }: PartRemoveButtonsProps): React.JSX.Element {
  const [boxes, setBoxes] = useState<PartBox[]>([]);
  const removable = blockIds.filter((id) => (tilePartsOf(template, id)?.names.length ?? 0) > 1).join(' ');

  useLayoutEffect(() => {
    const next = removable.split(' ').filter(Boolean).flatMap((id) => (tilePartsOf(template, id) ? partBoxes(stage, id) : []));
    setBoxes((previous) => (sameBoxes(previous, next) ? previous : next));
  }, [stage, removable, template, revision]);

  return (
    <>
      {boxes.map(({ blockId, index, box }) => {
        const name = tilePartsOf(template, blockId)?.names[index];
        if (name === undefined) return null;
        const label = t('templateEditor.removeNamed', { name });
        return (
          <LabelTooltip key={`${blockId}:${index}`} label={label}>
            <button
              {...chromeButtonProps()}
              className="atlas-te-part-remove atlas-te-chrome-control"
              style={cornerStyle(box)}
              aria-label={label}
              onClick={() => onRemove(blockId, index)}
            >
              <X aria-hidden="true" />
            </button>
          </LabelTooltip>
        );
      })}
    </>
  );
}
