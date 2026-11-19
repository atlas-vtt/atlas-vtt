import type { App } from 'obsidian';
import React, { useRef } from 'react';
import { useIsPresent } from 'framer-motion';
import { Skeleton, SkeletonGroup } from '../packages/components/primitives/Skeleton';
import { SiteFrame } from '../react/components/siteFrame/SiteFrame';
import { t } from '../i18n';
import { ARMARIUM_PAGE_URL } from './armariumUrls';
import { acceptFrameMessage } from './armariumMessages';
import { ArmariumInstaller } from './ArmariumInstaller';
import { useArmariumBridge } from './useArmariumBridge';
import type { StoreTagFilter } from './storeTagFilter';

/** Cards of the store's grid in outline. */
const SKELETON_CARDS = 6;

/** The store while it loads, as Atlas' frame shows it (without the site's header): a heading, the search and a grid of listing cards. */
function ArmariumSkeleton(): React.ReactElement {
  return (
    <SkeletonGroup className="atlas-site-frame__skeleton" label={t('armarium.loading')}>
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

/** The page is ready once it says hello: it says it as soon as it runs, while its pictures may still be loading. */
function saysHello(event: MessageEvent, frameWindow: Window | null): boolean {
  return acceptFrameMessage(event, frameWindow)?.type === 'atlas-armarium:hello';
}

/**
 * The Armarium, atlas-vtt.dev's library of collections, filling the asset manager's content area. Its Install buttons
 * ask Atlas to install a free collection (`useArmariumBridge`), whose import review opens over the same window, and its
 * Share a collection opens `onShare`, Atlas' own share. Each mount loads the page anew: the store's front, or the page
 * `url` names (a listing a share just published). Not `shown`, it stays mounted and hidden, its page as it was left,
 * and still hears where installs stand. The page leaves as soon as the window starts to close: it runs in a process of
 * its own, and the window's closing motion over it dropped most of the frames. With `tagFilter`, the page's tags reach
 * the asset manager's sidebar and its presses reach the page.
 */
export function ArmariumPane({ app, url = ARMARIUM_PAGE_URL, shown = true, onShare, tagFilter }: {
  app: App;
  url?: string;
  shown?: boolean;
  onShare?: () => void;
  tagFilter?: StoreTagFilter;
}): React.ReactElement {
  const paneRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const present = useIsPresent();
  useArmariumBridge(ArmariumInstaller.forApp(app), frameRef, paneRef, onShare, tagFilter);
  return (
    <div ref={paneRef} className={shown ? 'atlas-armarium-pane' : 'atlas-armarium-pane is-hidden'} inert={!shown}>
      {present && <SiteFrame
        url={url}
        label={t('armarium.page')}
        skeleton={<ArmariumSkeleton />}
        offlineBody={t('armarium.offlineBody')}
        frameRef={frameRef}
        readyMessage={saysHello}
      />}
    </div>
  );
}
