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
import { portalHost } from '../../../../host/portalHost';

const stop = (event: React.SyntheticEvent): void => event.stopPropagation();

/**
 * The menu is portaled out of the card, but React still bubbles its events
 * through the card, which would select or open the asset and show its tooltip.
 */
const keepEventsFromCard = {
  onClick: stop, onDoubleClick: stop, onContextMenu: stop, onKeyDown: stop, onMouseDown: stop,
  onPointerDown: stop, onPointerMove: stop, onFocus: stop, onBlur: stop, onDragStart: stop,
};

/**
 * The tag button on an asset card's artwork and the menu it opens. For the pointer: it lies in
 * the card's hidden art well and takes no focus, as the card is the grid's one control; the
 * card's menu offers Tags to the keyboard.
 */
export const AssetTagMenu = memo(function AssetTagMenu({ asset }: { asset: AnyAsset }): React.ReactElement {
  const { tags } = useAssetTagMenuActions();
  const [trigger, setTrigger] = useState<HTMLSpanElement | null>(null);
  const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();
  const count = tags.filter((tag) => hasAssetTag(asset.tags, tag)).length;

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <LabelTooltip label={count === 0 ? t('am.tagMenu.add') : t('am.tagMenu.count', { count })}>
        <DropdownMenu.Trigger asChild>
          <span
            ref={setTrigger}
            className="atlas-asset-card-tags"
            onClick={stop}
            onDoubleClick={stop}
            onKeyDown={stop}
          >
            <TagIcon aria-hidden />
            {/* Drawn from the attribute: the card's name holds no text of its hidden art well. */}
            {count > 0 && <span className="atlas-asset-card-tags__count" data-count={count} />}
          </span>
        </DropdownMenu.Trigger>
      </LabelTooltip>
      {/* Inside the asset manager's scope, where its styles apply. */}
      <DropdownMenu.Portal container={trigger?.closest<HTMLElement>('.atlas-vtt-plugin') ?? portalHost(trigger?.ownerDocument)}>
        <DropdownMenu.Content
          className="atlas-ctx-menu atlas-asset-tag-menu"
          role="dialog"
          // Radix gives its menu content an orientation, which a dialog takes none of (axe aria-allowed-attr), and
          // names it by its trigger, which lies in the card's hidden art well: the dialog names itself.
          aria-orientation={undefined}
          aria-labelledby={undefined}
          aria-label={t('assetGrid.tagsOf', { name: asset.name })}
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
