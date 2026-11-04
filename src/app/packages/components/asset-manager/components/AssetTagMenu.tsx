import React, { memo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Tag as TagIcon } from 'lucide-react';
import { hasAssetTag } from '../../../../services/tagGroups';
import { LabelTooltip } from '../../primitives/tooltip';
import { useExclusiveDropdown } from '../../primitives/useExclusiveDropdown';
import type { AnyAsset } from '../types';
import { AssetTagPicker } from './AssetTagPicker';
import { useAssetTagMenuActions } from './assetTagMenuContext';
import { t } from '../../../../i18n';

const stop = (event: React.SyntheticEvent): void => event.stopPropagation();

/**
 * The menu is portaled out of the card, but React still bubbles its events
 * through the card, which would select or open the asset and show its tooltip.
 */
const keepEventsFromCard = {
  onClick: stop, onDoubleClick: stop, onContextMenu: stop, onKeyDown: stop, onMouseDown: stop,
  onPointerDown: stop, onPointerMove: stop, onFocus: stop, onBlur: stop, onDragStart: stop,
};

/** The tag button on an asset card's artwork and the menu it opens. */
export const AssetTagMenu = memo(function AssetTagMenu({ asset }: { asset: AnyAsset }): React.ReactElement {
  const { tags } = useAssetTagMenuActions();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();
  const count = tags.filter((tag) => hasAssetTag(asset.tags, tag)).length;

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <LabelTooltip label={count === 0 ? t('am.tagMenu.add') : t('am.tagMenu.count', { count })}>
        <DropdownMenu.Trigger asChild>
          <button
            ref={setTrigger}
            type="button"
            className="atlas-asset-card-tags"
            onClick={stop}
            onDoubleClick={stop}
            onKeyDown={stop}
          >
            <TagIcon aria-hidden />
            {count > 0 && <span className="atlas-asset-card-tags__count">{count}</span>}
          </button>
        </DropdownMenu.Trigger>
      </LabelTooltip>
      {/* Inside the asset manager's scope, where its styles apply. */}
      <DropdownMenu.Portal container={trigger?.closest<HTMLElement>('.atlas-vtt-plugin') ?? trigger?.ownerDocument.body}>
        <DropdownMenu.Content
          className="atlas-ctx-menu atlas-asset-tag-menu"
          role="dialog"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
          {...keepEventsFromCard}
        >
          <AssetTagPicker asset={asset} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
});
