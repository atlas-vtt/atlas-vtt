import type { App } from 'obsidian';
import React, { useRef } from 'react';
import { useIsPresent } from 'framer-motion';
import { Skeleton, SkeletonGroup } from '../packages/components/primitives/Skeleton';
import { SiteFrame } from '../react/components/siteFrame/SiteFrame';
import { t } from '../i18n';
import { ARMARIUM_PAGE_URL } from './armariumUrls';
import { ArmariumInstaller } from './ArmariumInstaller';
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

/**
 * The Armarium, atlas-vtt.dev's library of collections, filling the asset manager's content area. Its Install buttons
 * ask Atlas to install a free collection (`useArmariumBridge`), whose import review opens over the same window, and its
 * Share a collection opens `onShare`, Atlas' own share. Each mount loads the page anew: the store's front, or the page
 * `url` names (a listing a share just published). The page leaves as soon as the window starts to close: it runs in a
 * process of its own, and the window's closing motion over it dropped most of the frames.
 */
export function ArmariumPane({ app, url = ARMARIUM_PAGE_URL, onShare }: { app: App; url?: string; onShare?: () => void }): React.ReactElement {
  const paneRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const present = useIsPresent();
  useArmariumBridge(ArmariumInstaller.forApp(app), frameRef, paneRef, onShare);
  return (
    <div ref={paneRef} className="atlas-armarium-pane">
      {present && <SiteFrame
        url={url}
        label={t('armarium.page')}
        skeleton={<ArmariumSkeleton />}
        offlineBody={t('armarium.offlineBody')}
        frameRef={frameRef}
      />}
    </div>
  );
}
