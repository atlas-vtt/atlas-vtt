import React from 'react';
import { shownHeaderParts, type HeaderPart } from '../model/templateHeader';
import type { HeaderPartId, StatblockTemplate } from '../model/templateTypes';
import { blockDisplay, type BlockDisplay } from './blockDisplay';
import { BlockFrame } from './BlockFrame';
import { ImageView } from './blocks/ImageView';
import { StatView } from './blocks/StatView';
import { TextView } from './blocks/TextView';
import { TitleView } from './blocks/TitleView';
import { TrackView } from './blocks/TrackView';
import { useSheet } from './sheetContext';
import { DisplayText } from './values/ValueText';
import { ValueSlot } from './valueSlot';

/** A part of the header the card draws now, with how it shows. */
interface DrawnPart {
  part: HeaderPart;
  display: BlockDisplay;
}

/** The type stands in the line under the name as its value alone ("Humanoid"); its label names it to the editor and the pane. */
function TypeView({ part, display }: DrawnPart): React.JSX.Element {
  return (
    <span className="atlas-sb-header__type">
      <ValueSlot block={part.block}><DisplayText display={display} /></ValueSlot>
    </span>
  );
}

function partContent(drawn: DrawnPart): React.ReactNode {
  const { part, display } = drawn;
  const { block } = part;
  switch (block.type) {
    case 'title': return <TitleView block={block} display={display} />;
    case 'image': return <ImageView block={block} display={display} />;
    case 'text': return <TextView block={block} display={display} />;
    case 'stat': return part.id === 'type' ? <TypeView {...drawn} /> : <StatView block={block} display={display} />;
    case 'track': return <TrackView block={block} display={display} />;
    default: return null;
  }
}

function PartFrame({ drawn }: { drawn: DrawnPart | undefined }): React.JSX.Element | null {
  if (!drawn) return null;
  return <BlockFrame block={drawn.part.block} display={drawn.display}>{partContent(drawn)}</BlockFrame>;
}

/**
 * The header every statblock has (`templateHeader.ts`), in the one
 * arrangement Atlas draws above the template's layout: the token art at the
 * right; at the left the name, the line under it with the level and the type
 * ("Level 3 · Humanoid"), the hit points and the description. A part the
 * template hides, or one with nothing to show, takes no room; in the editing
 * mode an empty part shows its prompt.
 */
export function StatblockHeader({ template }: { template: StatblockTemplate }): React.JSX.Element | null {
  const { state } = useSheet();
  const drawn = new Map<HeaderPartId, DrawnPart>();
  for (const part of shownHeaderParts(template)) {
    const display = blockDisplay(part.block, state);
    if (display) drawn.set(part.id, { part, display });
  }
  if (drawn.size === 0) return null;
  const level = drawn.get('level');
  const type = drawn.get('type');

  return (
    <div className="atlas-sb-header">
      <div className="atlas-sb-header__text">
        {(drawn.has('name') || level || type) && (
          <div className="atlas-sb-header__heading">
            <PartFrame drawn={drawn.get('name')} />
            {(level || type) && (
              <div className="atlas-sb-header__subtitle">
                <PartFrame drawn={level} />
                {level && type && <span className="atlas-sb-header__dot" aria-hidden="true">·</span>}
                <PartFrame drawn={type} />
              </div>
            )}
          </div>
        )}
        <PartFrame drawn={drawn.get('hp')} />
        <PartFrame drawn={drawn.get('description')} />
      </div>
      <PartFrame drawn={drawn.get('token')} />
    </div>
  );
}
