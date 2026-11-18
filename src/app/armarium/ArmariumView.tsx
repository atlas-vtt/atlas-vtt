import { ItemView, type WorkspaceLeaf } from 'obsidian';
import React, { useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Skeleton, SkeletonGroup } from '../packages/components/primitives/Skeleton';
import { SiteFrame } from '../react/components/siteFrame/SiteFrame';
import { t } from '../i18n';
import { ARMARIUM_PAGE_URL } from './armariumUrls';
import { ArmariumInstaller } from './ArmariumInstaller';
import { ARMARIUM_VIEW_TYPE } from './showArmarium';
import { useArmariumBridge } from './useArmariumBridge';

/** Cards of the store's grid in outline. */
const SKELETON_CARDS = 6;

/** The store while it loads: the site's header, a heading, the search and a grid of listing cards. */
function ArmariumSkeleton(): React.ReactElement {
  return (
    <SkeletonGroup className="atlas-site-frame__skeleton" label={t('armarium.loading')}>
      <Skeleton className="atlas-armarium-skeleton__bar" />
      <Skeleton className="atlas-armarium-skeleton__heading" />
      <Skeleton className="atlas-armarium-skeleton__search" />
      <div className="atlas-armarium-skeleton__grid">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <div key={index} className="atlas-armarium-skeleton__card">
            <Skeleton className="atlas-armarium-skeleton__cover" />
            <Skeleton shape="text" width="70%" />
            <Skeleton shape="text" width="45%" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

function ArmariumPage({ installer, win }: { installer: ArmariumInstaller | null; win: Window }): React.ReactElement {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useArmariumBridge(installer, frameRef, win);
  return (
    <SiteFrame
      url={ARMARIUM_PAGE_URL}
      label={t('armarium.page')}
      skeleton={<ArmariumSkeleton />}
      offlineBody={t('armarium.offlineBody')}
      frameRef={frameRef}
    />
  );
}

/**
 * The Armarium, atlas-vtt.dev's library of collections, in a tab of its own. Its Install buttons ask Atlas to install
 * a free collection (`useArmariumBridge`), which goes through the asset manager's import review.
 */
export class ArmariumView extends ItemView {
  private root: Root | null = null;
  /** Raised by Reload, which mounts the frame anew: the page loads again from the store's front. */
  private generation = 0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.addAction('rotate-cw', t('armarium.reload'), () => this.reload());
    this.addAction('external-link', t('armarium.openInBrowser'), () => { window.open(ARMARIUM_PAGE_URL); });
  }

  getViewType(): string {
    return ARMARIUM_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('armarium.title');
  }

  getIcon(): string {
    return 'store';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('atlas-vtt-plugin', 'atlas-armarium-view');
    this.root = createRoot(this.contentEl);
    this.render();
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  private reload(): void {
    this.generation += 1;
    this.render();
  }

  private render(): void {
    this.root?.render(
      <ArmariumPage key={this.generation} installer={ArmariumInstaller.forApp(this.app)} win={this.contentEl.win} />,
    );
  }
}
