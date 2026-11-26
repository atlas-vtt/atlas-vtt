import React, { type RefObject } from 'react';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../../packages/components/primitives/Skeleton';
import { SiteFrame } from '../siteFrame/SiteFrame';
import { ATLAS_DOCS_URL } from '../../../support/communityLinks';
import { t } from '../../../i18n';

/** Text bars of the page's opening paragraphs. */
const SKELETON_LINES = 7;

/** A page of the docs while it loads: the site's header, a heading and its first lines. */
function DocsSkeleton(): React.ReactElement {
  return (
    <SkeletonGroup className="atlas-site-frame__skeleton" label={t('docs.loading')}>
      <Skeleton className="atlas-docs-panel__skeleton-bar" />
      <Skeleton className="atlas-docs-panel__skeleton-heading" />
      {Array.from({ length: SKELETON_LINES }, (_, index) => (
        <Skeleton key={index} className="atlas-docs-panel__skeleton-line" width={skeletonTextWidth(index)} />
      ))}
    </SkeletonGroup>
  );
}

/** The live documentation site, with a skeleton until its first page has loaded and an offline state without a connection. */
export function DocsFrame({ frameRef }: { frameRef: RefObject<HTMLIFrameElement | null> }): React.ReactElement {
  return (
    <SiteFrame
      className="atlas-docs-panel__site"
      url={ATLAS_DOCS_URL}
      label={t('docs.panel')}
      skeleton={<DocsSkeleton />}
      offlineBody={t('docs.offlineBody')}
      frameRef={frameRef}
    />
  );
}
