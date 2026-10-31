import React from 'react';
import type { App } from 'obsidian';
import { openContextMenuGlobal } from '../../../react/root/ContextMenuContext';
import { useExperimentalFeature } from '../../../react/hooks/useExperimentalFeature';
import { useMapCollectionId } from '../../../react/hooks/useMapCollectionId';
import { SettingsService } from '../../../services/SettingsService';
import { runInBackground } from '../../../utils/backgroundTask';
import { editInStatblockPane } from './entryPoints';
import { ImageDisplayService } from '../../../services/ImageDisplayService';
import { t } from '../../../i18n';
import './create-statblock.scss';

interface StatblockFeedMenuProps {
  app: App;
  /** The statblock note the feed shows. */
  path: string;
  /** Something opened in the workspace: the DM screen gets out of its way. */
  onOpened: () => void;
  children: React.ReactNode;
}

/**
 * The DM screen's menu on a statblock (right-click): **Edit statblock**, which
 * opens the note, a native statblock with its statblock beside it (D9). Without the
 * statblock editor the feed is drawn as before, with no menu and no element
 * of its own.
 */
export function StatblockFeedMenu({ app, path, onOpened, children }: StatblockFeedMenuProps): React.JSX.Element {
  const editorOn = useExperimentalFeature('statblockEditor', SettingsService.forApp(app));
  const collectionId = useMapCollectionId();
  if (!editorOn) return <>{children}</>;

  const edit = (): void => {
    if (!editInStatblockPane(app, path, { collectionId, from: 'map' })) {
      runInBackground(app.workspace.openLinkText('', path, true), `Opening ${path}`, t('statblockEditor.openNoteFailed'));
    }
    onOpened();
  };
  const onContextMenu = (event: React.MouseEvent): void => {
    // A link inside the statblock keeps its own menu, and so does a vault picture, which can be shown to players.
    if (event.defaultPrevented || ImageDisplayService.getInstance()?.statblockImageFileAt(event.target as Element)) return;
    event.preventDefault();
    openContextMenuGlobal([{ type: 'item', label: t('statblockEditor.editStatblock'), icon: 'pencil', onClick: edit }], { x: event.clientX, y: event.clientY });
  };
  return <div className="atlas-dm-statblock-menu" onContextMenu={onContextMenu}>{children}</div>;
}
