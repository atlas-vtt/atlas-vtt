import React, { useLayoutEffect, useState, type RefObject } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { observeResize } from '../../../utils/observeResize';
import { findBlock } from '../../model/treeQueries';
import { isContainerBlock, type StatblockTemplate } from '../../model/templateTypes';
import { hoverStoreOf } from '../interaction/hoverStore';
import { containerTag } from './blockNames';
import { boxIn, type CanvasGap } from './canvasGaps';
import { blockFrame } from './editorChrome';
import type { Box } from './gapGeometry';
import { LabelEditor, type ChromeStyle, type LabelEditorProps } from './LabelEditor';
import { PartRemoveButtons } from './PartRemoveButtons';
import { primaryOf, type BlockSelection } from './selection';
import { tilePartsOf } from './tileParts';
import { useHoveredBlock, useStageGap } from './useStagePointer';
import { t } from '../../../i18n';

/** The card inside the stage: chrome looks up blocks only there, never in its own layer. */
export const SHEET_SELECTOR = '.atlas-statblock';
const WASH_MS = 600;

export interface LabelEditing extends Pick<LabelEditorProps, 'kind' | 'part' | 'text' | 'onCommit' | 'onCancel' | 'onStep'> {
  blockId: string;
}

export interface ChromeLayerProps {
  stageRef: RefObject<HTMLElement | null>;
  template: StatblockTemplate;
  selection: BlockSelection;
  /** Whether the template takes edits: the `+` line shows only then. */
  editable: boolean;
  label: LabelEditing | null;
  /** The block just inserted: it washes in the accent. */
  washId: string | null;
  onWashed: () => void;
  onSelect: (id: string) => void;
  onInsertAt: (gap: CanvasGap, anchor: Box) => void;
  /** Takes the number at `index` out of the Metric `id`; unset while the template takes no edits. */
  onRemovePart?: ((id: string, index: number) => void) | undefined;
}

/** A box of the stage as the custom properties chrome is placed by (`--atlas-te-x`, `-y`, `-w`, `-h`). */
export function boxStyle(box: Box): ChromeStyle {
  return {
    '--atlas-te-x': `${box.left}px`,
    '--atlas-te-y': `${box.top}px`,
    '--atlas-te-w': `${box.right - box.left}px`,
    '--atlas-te-h': `${box.bottom - box.top}px`,
  };
}

/** The line of a gap: across a stack's gap, along a row's. */
function gapBox(gap: CanvasGap): Box {
  const { x, y, length, orientation } = gap.line;
  return orientation === 'horizontal' ? { left: x, top: y, right: x + length, bottom: y } : { left: x, top: y, right: x, bottom: y + length };
}

/** The containers whose tag shows: the hovered one or the hovered block's, and the selected one. */
function taggedIds(template: StatblockTemplate, hovered: string | null, primary: string | null): string[] {
  const ids = new Set<string>();
  for (const id of [hovered, primary]) {
    const found = id === null ? null : findBlock(template.layout.blocks, id);
    if (!found) continue;
    if (isContainerBlock(found.block)) ids.add(found.block.id);
    else if (found.parentId !== null && id === hovered) ids.add(found.parentId);
  }
  return [...ids];
}

function sameBoxes(a: ReadonlyMap<string, Box>, b: ReadonlyMap<string, Box>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, box] of a) {
    const other = b.get(id);
    if (!other || other.left !== box.left || other.top !== box.top || other.right !== box.right || other.bottom !== box.bottom) return false;
  }
  return true;
}

/**
 * Chrome that floats over the card, placed from the blocks' boxes after each
 * render: the tags of containers, the `+` line in a gap, the label input and
 * the wash of a block just inserted. It shares the stage with the card and
 * takes the pointer only on its own controls.
 */
export function ChromeLayer(props: ChromeLayerProps): React.JSX.Element {
  const { stageRef, template, selection, editable, label, washId, onWashed, onSelect, onInsertAt, onRemovePart } = props;
  const hovered = useHoveredBlock(stageRef);
  const gap = useStageGap(stageRef, editable && label === null);
  const reduced = useReducedMotion() === true;
  const [resized, setResized] = useState(0);
  const [boxes, setBoxes] = useState<ReadonlyMap<string, Box>>(new Map());
  const [labelFrame, setLabelFrame] = useState<HTMLElement | null>(null);
  const tagged = taggedIds(template, hovered, primaryOf(selection));
  const measuredIds = [...tagged, ...(washId ? [washId] : [])].join(' ');

  useLayoutEffect(() => {
    const stage = stageRef.current;
    return stage ? observeResize([stage], () => setResized((count) => count + 1)) : undefined;
  }, [stageRef]);

  // After the card has rendered: its blocks stand where the chrome goes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const next = new Map<string, Box>();
    for (const id of measuredIds.split(' ').filter(Boolean)) {
      const frame = stage ? blockFrame(stage, id) : null;
      if (stage && frame) next.set(id, boxIn(stage, frame));
    }
    setBoxes((previous) => (sameBoxes(previous, next) ? previous : next));
  }, [stageRef, measuredIds, template, resized]);

  const labelId = label?.blockId ?? null;
  useLayoutEffect(() => {
    const stage = stageRef.current;
    setLabelFrame(stage && labelId ? blockFrame(stage, labelId) : null);
  }, [stageRef, labelId, template]);

  const stage = stageRef.current;
  const wash = washId ? boxes.get(washId) : undefined;
  const withParts = [...new Set([primaryOf(selection), hovered])].filter((id): id is string => id !== null && tilePartsOf(template, id) !== null);

  return (
    <div className="atlas-te-chrome">
      {tagged.map((id) => {
        const box = boxes.get(id);
        const block = findBlock(template.layout.blocks, id)?.block;
        if (!box || !block) return null;
        return (
          <button
            key={id}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="atlas-te-tag atlas-te-chrome-control"
            style={boxStyle(box)}
            data-selected={selection.includes(id) || undefined}
            onClick={() => onSelect(id)}
            // A container's blocks cover it: pointing at its tag points at the container, whose handle then shows (§3.1).
            onPointerEnter={() => {
              const frame = stage ? blockFrame(stage, id) : null;
              if (stage && frame) hoverStoreOf(stage).set({ kind: 'block', element: frame, blockId: id });
            }}
          >
            {containerTag(block, template.fields)}
          </button>
        );
      })}
      {gap && (
        <LabelTooltip label={t('templateEditor.addBlockHere')}>
          <button
            type="button"
            tabIndex={-1}
            className="atlas-te-gap atlas-te-chrome-control"
            data-orientation={gap.line.orientation}
            style={boxStyle(gapBox(gap))}
            onClick={() => onInsertAt(gap, gapBox(gap))}
          >
            <span className="atlas-te-gap__plus"><Plus aria-hidden="true" /></span>
          </button>
        </LabelTooltip>
      )}
      {wash && (
        <div key={washId} className="atlas-te-wash" style={boxStyle(wash)}>
          <motion.div
            className="atlas-te-wash__fill"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: (reduced ? WASH_MS / 2 : WASH_MS) / 1000 }}
            onAnimationComplete={onWashed}
          />
        </div>
      )}
      {stage && editable && onRemovePart && label === null && (
        <PartRemoveButtons stage={stage} template={template} blockIds={withParts} revision={resized} onRemove={onRemovePart} />
      )}
      {label && stage && labelFrame && (
        <LabelEditor
          key={`${label.blockId}:${label.part ?? ''}`}
          stage={stage}
          frame={labelFrame}
          kind={label.kind}
          part={label.part}
          text={label.text}
          onCommit={label.onCommit}
          onCancel={label.onCancel}
          onStep={label.onStep}
        />
      )}
    </div>
  );
}
