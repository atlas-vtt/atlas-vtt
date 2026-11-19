import React, { useEffect, useRef } from 'react';
import type { App } from 'obsidian';
import { t } from '../../i18n';
import { AtlasUIContext } from '../../react/root/AtlasUIContext';
import type { ItemKind } from '../../services/itemBundle/itemBundleFormat';
import { saveItemBundle } from '../../services/itemBundle/itemExport';
import { showHostedDialog } from '../../statblocks/editor/hostedDialog';
import { showNotice } from '../../ui/notice';
import type { ContextMenuEntry } from '../../react/components/context-menu/AtlasContextMenu';
import { createItemShareSession } from '../upload/createShareSession';
import type { ItemShareSession } from '../upload/ItemShareSession';
import type { SharedItem } from '../upload/shareState';
import { ArmariumShareLayer } from './ArmariumShareLayer';
import { ItemSharePicker } from './ItemSharePicker';
import { leaveShare } from './leaveShare';

/** The class of a hosted share's container: Atlas' scope, whose styles the share's dialogs take. */
const HOST_CLASS = 'atlas-vtt-plugin atlas-share-host';

/** The share of one item over whatever is open; a host that goes without Close (its window closed) leaves it as Close does. */
function HostedShare({ app, session, onClose }: { app: App; session: ItemShareSession; onClose: () => void }): React.JSX.Element {
  const closed = useRef(false);
  useEffect(() => () => {
    if (!closed.current) void leaveShare(session);
  }, [session]);
  const close = (): void => {
    closed.current = true;
    onClose();
  };
  return (
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ArmariumShareLayer session={session} onClose={close} />
    </AtlasUIContext.Provider>
  );
}

/**
 * "Share in the Armarium" of one statblock template, game system or dice set, from wherever its menu is (the
 * collection's settings, the template editor, the Dice Lab, the Armarium): the share dialog on `doc`'s body, over
 * whatever is open there.
 */
export function openItemShare(app: App, item: SharedItem, doc: Document = activeDocument): void {
  const session = createItemShareSession(app, item);
  if (session === null) {
    showNotice(t('armariumShare.notReady'));
    return;
  }
  session.start();
  showHostedDialog(doc, HOST_CLASS, (close) => <HostedShare key="share" app={app} session={session} onClose={close} />);
}

/** The vault's own items of `kind` to choose from, then the share of the one chosen (the Armarium's Share, in Atlas). */
export function pickItemToShare(app: App, kind: ItemKind, doc: Document = activeDocument): void {
  showHostedDialog(doc, HOST_CLASS, (close) => (
    <ItemSharePicker key="pick" app={app} kind={kind} onClose={close} onPick={(item) => {
      close();
      openItemShare(app, item, doc);
    }} />
  ));
}

/** An item's own menu rows for the Armarium: share it there, or export it as a file to hand to someone. */
export function itemShareEntries(app: App, item: SharedItem, doc?: Document): ContextMenuEntry[] {
  return [
    { type: 'item', label: t('armariumShare.shareItem'), icon: 'cloud-upload', onClick: () => openItemShare(app, item, doc) },
    { type: 'item', label: t('armariumShare.exportItem'), icon: 'download', onClick: () => saveItemBundle(app, item) },
  ];
}
