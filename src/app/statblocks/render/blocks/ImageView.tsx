import React from 'react';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { ImageBlock } from '../../model/templateTypes';
import { valueText } from '../../values/valueText';
import { linkedTokenArt, statblockImageSrc, statblockImageToken } from '../shared/statblockImage';
import { useSheet } from '../sheetContext';
import { StandIn } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

function ImageContent({ block, display }: BlockViewProps<ImageBlock>): React.JSX.Element | null {
  const { state, app, sourcePath } = useSheet();
  if (display.state !== 'value') return <StandIn display={display} />;

  const art = state.token?.art;
  const name = valueText(state.reader('name'));
  if (art) {
    return <TokenPortrait className="atlas-sb-token-image" src={art.src} alt={name} ringColor={art.ringColor} showRing={art.showRing} />;
  }

  const raw = valueText(state.reader(block.field));
  const own = statblockImageSrc(app, raw, sourcePath);
  // A note without a picture it can show shows its linked token's art.
  const linked = !own && app ? linkedTokenArt(app, sourcePath) : null;
  const src = own || linked?.src;
  if (!src) return null;
  if (block.shape === 'token') {
    // Art that is a token's is framed as that token is, so the statblock and the map agree.
    const token = linked?.token ?? (app ? statblockImageToken(app, raw, sourcePath) : null);
    return <TokenPortrait className="atlas-sb-token-image" src={src} alt={name} showRing={token?.showRing !== false} />;
  }
  return <img className="atlas-sb-portrait-image" src={src} alt={name} draggable={false} decoding="async" />;
}

/**
 * The creature's art: framed as a token, or as a portrait. A statblock shown
 * for a token shows the token's art, so the two never differ; a note whose
 * own picture cannot be shown shows its linked token's.
 */
export function ImageView(props: BlockViewProps<ImageBlock>): React.JSX.Element {
  return <ValueSlot block={props.block}><ImageContent {...props} /></ValueSlot>;
}
