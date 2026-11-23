import React, { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { Check } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { ATLAS_DISCORD_URL, ATLAS_DOCS_URL } from '../../support/communityLinks';
import { COMPANION_URLS, companionInUse } from '../companions';
import type { LookService } from '../../appearance/lookService';
import { AppearanceChoices } from '../../appearance/AppearanceChoices';
import sidebarPicture from '../../assets/welcome/sidebar.webp';
import { t } from '../../i18n';

interface WelcomeTextProps {
  /** A small line above the heading; a page whose heading says it all has none. */
  kicker?: string;
  title: string;
  /** A small status after the heading, such as a part still in beta. */
  tag?: string;
  body: string;
  children?: React.ReactNode;
}

/** A page's words: a small kicker where there is one, the heading in the look's heading face (with a status tag where there is one), and a line or two under it. */
export function WelcomeText({ kicker, title, tag, body, children }: WelcomeTextProps): React.JSX.Element {
  return (
    <div className="atlas-welcome-text">
      {kicker && <span className="atlas-welcome-text__kicker">{kicker}</span>}
      <h2 className="atlas-welcome-text__title">
        {title}
        {tag && <> <span className="atlas-welcome-text__tag">{tag}</span></>}
      </h2>
      <p className="atlas-welcome-text__body">{body}</p>
      {children}
    </div>
  );
}

/** Where help is: the guides, Discord, and the palette's key. */
export function HelpPage({ paletteKey }: { paletteKey: string }): React.JSX.Element {
  return (
    <div className="atlas-welcome-page atlas-welcome-page--text">
      <WelcomeText kicker={t('tour.welcome.helpKicker')} title={t('tour.welcome.helpTitle')} body={t('tour.welcome.helpBody')}>
        <div className="atlas-welcome-key">
          <kbd>{paletteKey}</kbd>
          <span>{t('tour.welcome.paletteKey')}</span>
        </div>
        <div className="atlas-welcome-actions">
          <Button variant="secondary" onClick={() => window.open(ATLAS_DISCORD_URL)}>{t('tour.welcome.discord')}</Button>
          <Button variant="ghost" onClick={() => window.open(ATLAS_DOCS_URL)}>{t('tour.welcome.guides')}</Button>
        </div>
      </WelcomeText>
    </div>
  );
}

/** Atlas Sidebar, pictured beside a map, offered until it is enabled. */
export function SidebarPage({ app }: { app: App }): React.JSX.Element {
  const inUse = useSidebarInUse(app);
  return (
    <div className="atlas-welcome-page atlas-welcome-page--split">
      <img className="atlas-welcome-picture" src={sidebarPicture} alt={t('tour.welcome.sidebarPicture')} draggable={false} />
      <WelcomeText kicker={t('tour.welcome.sidebarKicker')} title={t('tour.welcome.sidebarName')} body={t('tour.welcome.sidebarBody')}>
        <div className="atlas-welcome-actions">
          {inUse
            ? <span className="atlas-welcome-status"><Check aria-hidden="true" />{t('tour.welcome.inUse')}</span>
            : <Button onClick={() => window.open(COMPANION_URLS.sidebar)}>{t('tour.welcome.view')}</Button>}
        </div>
        {!inUse && <p className="atlas-welcome-text__note">{t('tour.welcome.sidebarNote')}</p>}
      </WelcomeText>
    </div>
  );
}

/** The look and the accent colour, as the palette's Appearance settings show them; the choice is this device's and shows at once. */
export function LookPage({ app, looks }: { app: App; looks: LookService }): React.JSX.Element {
  return (
    <div className="atlas-welcome-page atlas-welcome-page--looks">
      <WelcomeText title={t('tour.welcome.lookTitle')} body={t('tour.welcome.lookBody')} />
      <AppearanceChoices app={app} looks={looks} />
    </div>
  );
}

/** Follows the add-on while its page shows, so a GM back from installing it sees it ticked. */
function useSidebarInUse(app: App): boolean {
  const [inUse, setInUse] = useState(() => companionInUse(app, 'sidebar'));
  useEffect(() => {
    // ponytail: polls once a second while the page shows; Obsidian announces no plugin being enabled.
    const timer = window.setInterval(() => setInUse(companionInUse(app, 'sidebar')), 1000);
    return () => window.clearInterval(timer);
  }, [app]);
  return inUse;
}
