import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import type { AssetService } from '../../../../services/AssetService';
import { BESTIARY_BYTES } from '../../../../services/stockPacks/bestiaryTokens';
import { StarterTokensChoice } from '../components/StarterTokensChoice';
import type { HeaderMenuItem } from '../components/HeaderMenu';
import type { Tab } from '../types';
import { useCloseOutside, useStarterTokens, type StarterTokens } from './useStarterTokens';

/** The Create menu's way to the starter tokens: its item, and the statblock choice it opens under the menu's button. */
export interface StarterTokensEntry {
  item: HeaderMenuItem;
  popover: React.ReactNode;
}

/** The menu item's muted end: the size, how far a download got, or that the collection holds them. */
function detailOf(starter: StarterTokens, size: number): string {
  if (starter.download.phase === 'downloading') return `${Math.floor(starter.download.share * 100)}%`;
  if (starter.present === true) return t('am.bestiary.inCollection');
  return t('am.bestiary.size', { size });
}

function MenuChoice({ starter, size, onClose }: { starter: StarterTokens; size: number; onClose: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // Focus goes back to the Create button it was opened from, as the menu's own Escape does.
  const close = useCallback((): void => {
    const root = ref.current?.closest('.atlas-am-menu-root');
    if (root?.contains(root.ownerDocument.activeElement)) root.querySelector<HTMLElement>('.atlas-asset-manager-create-btn')?.focus();
    onClose();
  }, [onClose]);
  useCloseOutside(ref, true, onClose);
  return (
    <div ref={ref} className="atlas-starter-menu-anchor">
      <StarterTokensChoice
        choice={starter.choice}
        onChoose={starter.setChoice}
        onDownload={() => {
          onClose();
          starter.start();
        }}
        onClose={close}
        placement="bottom"
        align="end"
        size={size}
        focusChoice
      />
    </div>
  );
}

/**
 * The Tokens tab's "Get starter tokens…" in the Create menu. It is there whether or not the sidebar's offer was
 * hidden, and choosing it leaves that choice as it is; it is shown but not offered while the collection holds the
 * pack or a download runs.
 */
export function useStarterTokensEntry(app: App, assets: AssetService | undefined, collection: string, tab: Tab): StarterTokensEntry | null {
  const starter = useStarterTokens(app, assets, collection);
  const [choosing, setChoosing] = useState(false);
  const close = useCallback((): void => setChoosing(false), []);
  useEffect(() => setChoosing(false), [collection, tab]);
  if (tab !== 'tokens' || !assets) return null;
  const size = Math.round(BESTIARY_BYTES / 1_000_000);
  const offered = starter.present === false && !starter.busy;
  return {
    item: {
      key: 'starter',
      label: t('am.header.getStarterTokens'),
      icon: <Download />,
      detail: detailOf(starter, size),
      disabled: !offered,
      onSelect: () => setChoosing(true),
    },
    popover: choosing && offered ? <MenuChoice starter={starter} size={size} onClose={close} /> : null,
  };
}
