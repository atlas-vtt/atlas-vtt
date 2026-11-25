import React from 'react';
import type { App } from 'obsidian';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { ATLAS_DISCORD_URL, ATLAS_DOCS_URL, ATLAS_GITHUB_URL, ATLAS_PATREON_URL } from '../../support/communityLinks';
import type { LookService } from '../../appearance/lookService';
import { AppearanceChoices } from '../../appearance/AppearanceChoices';
import { DiscordIcon } from '../../changelog/DiscordIcon';
import { GitHubIcon } from '../../changelog/GitHubIcon';
import { PatreonIcon } from '../../changelog/PatreonIcon';
import type { MessageKey } from '../../i18n/types';
import { t } from '../../i18n';
import './community.scss';

interface WelcomeTextProps {
  /** A small line above the heading; a page whose heading says it all has none. */
  kicker?: string;
  title: React.ReactNode;
  body: string;
  /** A second line with a small status after it, such as a part still in beta: the status belongs to that line alone. */
  aside?: { line: string; tag: string };
  children?: React.ReactNode;
}

/** A page's words: a small kicker where there is one, the heading in the look's heading face, a line or two under it, and a tagged line where there is one. */
export function WelcomeText({ kicker, title, body, aside, children }: WelcomeTextProps): React.JSX.Element {
  return (
    <div className="atlas-welcome-text">
      {kicker && <span className="atlas-welcome-text__kicker">{kicker}</span>}
      <h2 className="atlas-welcome-text__title">{title}</h2>
      <p className="atlas-welcome-text__body">{body}</p>
      {aside && (
        <p className="atlas-welcome-text__body atlas-welcome-text__aside">
          {aside.line} <span className="atlas-welcome-text__tag">{aside.tag}</span>
        </p>
      )}
      {children}
    </div>
  );
}

/** Where help is: the guides and the palette's key. */
export function HelpPage({ paletteKey }: { paletteKey: string }): React.JSX.Element {
  return (
    <div className="atlas-welcome-page atlas-welcome-page--text">
      <WelcomeText kicker={t('tour.welcome.helpKicker')} title={t('tour.welcome.helpTitle')} body={t('tour.welcome.helpBody')}>
        <div className="atlas-welcome-key">
          <kbd>{paletteKey}</kbd>
          <span>{t('tour.welcome.paletteKey')}</span>
        </div>
        <div className="atlas-welcome-actions">
          <Button variant="secondary" onClick={() => window.open(ATLAS_DOCS_URL)}>{t('tour.welcome.guides')}</Button>
        </div>
      </WelcomeText>
    </div>
  );
}

/** The look, the accent colour and the ivy colour, as the palette's Appearance settings show them; the choice is this device's and shows at once. */
export function LookPage({ app, looks }: { app: App; looks: LookService }): React.JSX.Element {
  return (
    <div className="atlas-welcome-page atlas-welcome-page--looks">
      <WelcomeText title={t('tour.welcome.lookTitle')} body={t('tour.welcome.lookBody')} />
      <AppearanceChoices app={app} looks={looks} />
    </div>
  );
}

interface CommunityLink {
  id: 'guides' | 'discord' | 'patreon' | 'github';
  url: string;
  Icon: React.ComponentType;
  title: MessageKey;
  body: MessageKey;
}

const COMMUNITY: readonly CommunityLink[] = [
  { id: 'guides', url: ATLAS_DOCS_URL, Icon: BookOpen, title: 'tour.welcome.guides', body: 'tour.welcome.guidesBody' },
  { id: 'discord', url: ATLAS_DISCORD_URL, Icon: DiscordIcon, title: 'tour.welcome.discord', body: 'tour.welcome.discordBody' },
  { id: 'patreon', url: ATLAS_PATREON_URL, Icon: PatreonIcon, title: 'tour.welcome.patreon', body: 'tour.welcome.patreonBody' },
  { id: 'github', url: ATLAS_GITHUB_URL, Icon: GitHubIcon, title: 'tour.welcome.github', body: 'tour.welcome.githubBody' },
];

/** Where to go from here, on a blueprint of a dungeon: the guides, the Discord, the Patreon and the code, each a card that opens in the browser. */
export function JoinPage(): React.JSX.Element {
  return (
    <div className="atlas-welcome-page atlas-welcome-page--split atlas-welcome-page--join">
      <WelcomeText kicker={t('tour.welcome.joinKicker')} title={t('tour.welcome.joinTitle')} body={t('tour.welcome.joinBody')} />
      <div className="atlas-welcome-community">
        {COMMUNITY.map(({ id, url, Icon, title, body }) => (
          <button key={id} type="button" className="atlas-welcome-community__link" data-brand={id} onClick={() => window.open(url)}>
            <span className="atlas-welcome-community__icon"><Icon /></span>
            <span className="atlas-welcome-community__words">
              <span className="atlas-welcome-community__title">{t(title)}</span>
              <span className="atlas-welcome-community__body">{t(body)}</span>
            </span>
            <ArrowUpRight className="atlas-welcome-community__arrow" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
