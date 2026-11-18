import React, { useState, type RefObject } from 'react';
import { WifiOff } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { t } from '../../../i18n';

/** Scripts and same-origin storage for the site's search, popups for its outside links (they open in the browser), forms for its search box. */
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms';
/** The site's clips play muted on their own, and can be watched full screen. */
const ALLOW = 'fullscreen; autoplay; encrypted-media; picture-in-picture';

export interface SiteFrameProps {
  /** The page of atlas-vtt.dev the frame opens on. */
  url: string;
  /** Names the frame for screen readers. */
  label: string;
  /** The page in outline while it loads, built from `Skeleton`s in the page's own shape. */
  skeleton: React.ReactNode;
  /** Says what needs the connection, under "You are offline". */
  offlineBody: string;
  /** The frame element: held at its size while a window is resized, and the window that messages come from. */
  frameRef: RefObject<HTMLIFrameElement | null>;
  className?: string;
}

/** Shown in place of the frame while the device has no connection. */
function Offline({ body, onRetry }: { body: string; onRetry: () => void }): React.ReactElement {
  return (
    <div className="atlas-site-frame__offline" role="status">
      <span className="atlas-site-frame__offline-icon"><WifiOff /></span>
      <p className="atlas-site-frame__offline-title">{t('siteFrame.offline')}</p>
      <p className="atlas-site-frame__offline-body">{body}</p>
      <Button variant="default" onClick={onRetry}>{t('siteFrame.retry')}</Button>
    </div>
  );
}

type LiveFrameProps = Pick<SiteFrameProps, 'url' | 'label' | 'skeleton' | 'frameRef'>;

/** The site in a frame; its own state, so every mount starts with the skeleton. */
function LiveFrame({ url, label, skeleton, frameRef }: LiveFrameProps): React.ReactElement {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <iframe
        ref={frameRef}
        className={`atlas-site-frame__frame${loaded ? ' is-loaded' : ''}`}
        src={url}
        aria-label={label}
        sandbox={SANDBOX}
        allow={ALLOW}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="eager"
        onLoad={() => setLoaded(true)}
      />
      {!loaded && skeleton}
    </>
  );
}

/**
 * A page of atlas-vtt.dev in a sandboxed frame, with a skeleton until its first page has loaded.
 * Offline it shows why instead of an empty frame, and loads again once the connection is back.
 * The documentation window and the asset manager's Armarium both show the site through it.
 */
export function SiteFrame({ url, label, skeleton, offlineBody, frameRef, className }: SiteFrameProps): React.ReactElement {
  const online = useOnlineStatus();
  // A retry renders again, which reads the connection anew, and gives the frame a fresh load.
  const [attempt, setAttempt] = useState(0);
  const retry = (): void => setAttempt((n) => n + 1);
  return (
    <div className={className ? `atlas-site-frame ${className}` : 'atlas-site-frame'}>
      {online
        ? <LiveFrame key={attempt} url={url} label={label} skeleton={skeleton} frameRef={frameRef} />
        : <Offline body={offlineBody} onRetry={retry} />}
    </div>
  );
}
