import React from 'react';
import { ChevronDown, CloudUpload, ExternalLink, RotateCw } from 'lucide-react';
import type { ShareWhat } from '../../../../armarium/armariumMessages';
import { ITEM_KINDS } from '../../../../services/itemBundle/itemBundleFormat';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { ActionsMenuButton } from '../../shared/ActionsMenuButton';
import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import { t } from '../../../../i18n';

interface ArmariumActionsProps {
  onReload: () => void;
  /** The page the store shows, which Open in browser opens. */
  page: string;
  /** Shares the selected collection in the Armarium, or one of the vault's items of a kind. */
  onShare: (what: ShareWhat) => void;
}

const ITEM_ICONS: Readonly<Record<(typeof ITEM_KINDS)[number], string>> = {
  'statblock-template': 'scroll-text',
  'system-preset': 'shapes',
  'dice-set': 'dices',
};

/**
 * The header's actions while the Armarium is shown, where the library's search and Create stand: Share the selected
 * collection in one press, a statblock template, game system or dice set from the menu beside it.
 */
export function ArmariumActions({ onReload, page, onShare }: ArmariumActionsProps): React.JSX.Element {
  const items: ContextMenuEntry[] = ITEM_KINDS.map((kind) => ({ type: 'item', label: t(`armariumShare.menu.${kind}`), icon: ITEM_ICONS[kind], onClick: () => onShare(kind) }));
  return (
    <div className="atlas-am-armarium-actions">
      <LabelTooltip label={t('armariumShare.shareSelected')}>
        <Button variant="ghost" size="icon" className="atlas-am-header-action" onClick={() => onShare('collection')}>
          <CloudUpload />
        </Button>
      </LabelTooltip>
      <ActionsMenuButton label={t('armariumShare.menu.items')} entries={items} icon={ChevronDown} className="atlas-am-header-action" />
      <LabelTooltip label={t('armarium.reload')}>
        <Button variant="ghost" size="icon" className="atlas-am-header-action" onClick={onReload}>
          <RotateCw />
        </Button>
      </LabelTooltip>
      <LabelTooltip label={t('armarium.openInBrowser')}>
        <Button
          variant="ghost"
          size="icon"
          className="atlas-am-header-action"
          onClick={() => { window.open(page); }}
        >
          <ExternalLink />
        </Button>
      </LabelTooltip>
    </div>
  );
}
