import React, { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../../packages/components/primitives/Skeleton';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { ATLAS_DOCS_URL } from '../../../support/communityLinks';
import { t } from '../../../i18n';

/** Scripts and same-origin storage for the site's search, popups for its outside links (they open in the browser), forms for its search box. */
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms';
/** The guides' clips play muted on their own, and can be watched full screen. */
const ALLOW = 'fullscreen; autoplay; encrypted-media; picture-in-picture';
/** Text bars of the page's opening paragraphs. */
const SKELETON_LINES = 7;

/** A page of the docs while it loads: the site's header, a heading and its first lines. */
function DocsSkeleton(): React.ReactElement {
  return (
    <SkeletonGroup className="atlas-docs-panel__skeleton" label={t('docs.loading')}>
      <Skeleton className="atlas-docs-panel__skeleton-bar" />
      <Skeleton className="atlas-docs-panel__skeleton-heading" />
      {Array.from({ length: SKELETON_LINES }, (_, index) => (
        <Skeleton key={index} className="atlas-docs-panel__skeleton-line" width={skeletonTextWidth(index)} />
      ))}
    </SkeletonGroup>
  );
}

/** Shown in place of the frame while the device has no connection. */
function DocsOffline({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return (
    <div className="atlas-docs-panel__offline" role="status">
      <span className="atlas-docs-panel__offline-icon"><WifiOff /></span>
      <p className="atlas-docs-panel__offline-title">{t('docs.offline')}</p>
      <p className="atlas-docs-panel__offline-body">{t('docs.offlineBody')}</p>
      <Button variant="default" onClick={onRetry}>{t('docs.retry')}</Button>
    </div>
  );
}

/** The site in a frame; its own state, so every mount starts with the skeleton. */
function LiveFrame(): React.ReactElement {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="atlas-docs-panel__frame-area">
      <iframe
        className={`atlas-docs-panel__frame${loaded ? ' is-loaded' : ''}`}
        src={ATLAS_DOCS_URL}
        aria-label={t('docs.panel')}
        sandbox={SANDBOX}
        allow={ALLOW}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="eager"
        onLoad={() => setLoaded(true)}
      />
      {!loaded && <DocsSkeleton />}
    </div>
  );
}

/**
 * The live documentation site, with a skeleton until its first page has loaded. Offline it
 * shows why instead of an empty frame, and loads again once the connection is back.
 */
export function DocsFrame(): React.ReactElement {
  const online = useOnlineStatus();
  // A retry renders again, which reads the connection anew, and gives the frame a fresh load.
  const [attempt, setAttempt] = useState(0);
  const retry = (): void => setAttempt((n) => n + 1);
  return online ? <LiveFrame key={attempt} /> : <DocsOffline onRetry={retry} />;
}
