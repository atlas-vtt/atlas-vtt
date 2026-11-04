import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ATLAS_DISCORD_URL } from '../support/communityLinks';
import { DiscordIcon } from './DiscordIcon';
import { t } from '../i18n';

/** Invitation to the Atlas Discord; opens in the system browser like any external link in Obsidian. */
export function CommunityLink(): React.JSX.Element {
  return <a className="atlas-changelog-community" href={ATLAS_DISCORD_URL} target="_blank" rel="noopener noreferrer">
    <span className="atlas-changelog-community-mark">
      <DiscordIcon />
    </span>
    <span className="atlas-changelog-community-text">
      <span className="atlas-changelog-community-title">{t('changelog.community')}</span>
      <span className="atlas-changelog-community-description">
        {t('settings.support.discordDesc')}
      </span>
    </span>
    <ArrowUpRight className="atlas-changelog-community-arrow" aria-hidden="true" />
  </a>;
}
