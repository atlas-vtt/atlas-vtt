import React, { useCallback, useMemo, useRef } from 'react';
import type { ContentItem, TokenPreview } from '../../../../services/collectionBundle/bundleContents';
import { useModHoverStatblockPreview } from '../hooks/useModHoverStatblockPreview';
import type { ContentMedia } from './contentMedia';
import { itemState, withKeys, type ContentSelection } from './contentSelection';
import { TokenCard } from './TokenCard';
import { useTransferScroller } from './transferScroll';
import { VirtualGrid } from './VirtualGrid';

type TokenItem = ContentItem & { token: TokenPreview };

interface TokenGridProps {
  items: readonly ContentItem[];
  media: ContentMedia;
  selection?: ContentSelection | undefined;
}

const isToken = (item: ContentItem): item is TokenItem => item.token !== undefined;

/**
 * Tokens as cards, rendered only as far as the pane shows them. Holding Mod
 * over a token with a statblock opens the statblock as in the asset manager:
 * from the vault when exporting, from the file itself (with its own templates) when importing.
 */
export function TokenGrid({ items, media, selection }: TokenGridProps): React.JSX.Element {
  const tokens = useMemo(() => items.filter(isToken), [items]);
  const scroller = useTransferScroller();
  useModHoverStatblockPreview({
    app: media.app,
    container: scroller,
    cardSelector: '.atlas-transfer-token',
    targetOf: (card) => {
      const item = tokens.find(({ key }) => key === card.dataset.itemKey);
      if (!item?.token.statblockPath) return null;
      const token = { name: item.name, imagePath: item.token.imagePath, showRing: item.token.showRing };
      return { key: item.key, notePath: item.token.statblockPath, token };
    },
    noteText: (path) => media.noteText(path),
    bundleTemplates: media.templates,
  });

  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onToggle = useCallback((key: string, include: boolean): void => {
    const current = selectionRef.current;
    if (current) current.onChange(withKeys(current.excluded, [key], include));
  }, []);

  return (
    <VirtualGrid
      items={tokens}
      minColumnWidth={96}
      rowHeight={120}
      rowGap={8}
      columnGap={8}
      className="atlas-transfer-token-grid"
      itemKey={(item) => item.key}
      renderItem={(item) => (
        <TokenCard item={item} state={itemState(selection, item.key)} media={media} onToggle={onToggle} />
      )}
    />
  );
}
