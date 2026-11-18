import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';
import { openContextMenuGlobal } from '../../../../react/root/ContextMenuContext';
import type { ContentItem, TokenPreview } from '../../../../services/collectionBundle/bundleContents';
import { previewEntry } from '../../../../services/previewByHand';
import { previewStatblockByHand } from '../../../../services/statblockPreviewByHand';
import { useModHoverStatblockPreview, type StatblockPreviewTarget } from '../hooks/useModHoverStatblockPreview';
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
const CARD = '.atlas-transfer-token';

/**
 * Tokens as cards, rendered only as far as the pane shows them. Holding Mod
 * over a token with a statblock opens the statblock as in the asset manager:
 * from the vault when exporting, from the file itself (with its own templates) when importing.
 * The token's menu has a Preview row that opens the same, for a hand that holds no key.
 */
export function TokenGrid({ items, media, selection }: TokenGridProps): React.JSX.Element {
  const tokens = useMemo(() => items.filter(isToken), [items]);
  const scroller = useTransferScroller();
  const targetOf = useStableCallback((card: HTMLElement): StatblockPreviewTarget | null => {
    const item = tokens.find(({ key }) => key === card.dataset.itemKey);
    if (!item?.token.statblockPath) return null;
    const token = { name: item.name, imagePath: item.token.imagePath, showRing: item.token.showRing };
    return { key: item.key, notePath: item.token.statblockPath, token };
  });
  useModHoverStatblockPreview({
    app: media.app,
    container: scroller,
    cardSelector: CARD,
    targetOf,
    noteText: (path) => media.noteText(path),
    bundleTemplates: media.templates,
  });

  // A finger holds no Mod: a token with a statblock has a menu whose one row opens it, which a long press reaches.
  const preview = useStableCallback((target: StatblockPreviewTarget): void => {
    void media.noteText(target.notePath).then((text) => {
      previewStatblockByHand(media.app, target.notePath, target.token, text === undefined ? undefined : { text, templates: media.templates });
    });
  });
  useEffect(() => {
    if (!scroller) return undefined;
    const onContextMenu = (event: MouseEvent): void => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(CARD) : null;
      const target = card ? targetOf(card) : null;
      if (!target) return;
      event.preventDefault();
      openContextMenuGlobal([previewEntry(() => preview(target))], { x: event.clientX, y: event.clientY });
    };
    scroller.addEventListener('contextmenu', onContextMenu);
    return () => scroller.removeEventListener('contextmenu', onContextMenu);
  }, [scroller, targetOf, preview]);

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
