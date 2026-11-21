import React from 'react';
import { Globe } from 'lucide-react';
import { LabelTooltip } from '../packages/components/primitives/tooltip';
import { ATLAS_GITHUB_URL, ATLAS_PATREON_URL, ATLAS_WEBSITE_URL } from '../support/communityLinks';
import { GitHubIcon } from './GitHubIcon';
import { PatreonIcon } from './PatreonIcon';
import { t } from '../i18n';

interface HeaderLink {
  href: string;
  label: string;
  icon: React.JSX.Element;
}

const links = (): HeaderLink[] => [
  { href: ATLAS_WEBSITE_URL, label: t('changelog.website'), icon: <Globe /> },
  { href: ATLAS_PATREON_URL, label: t('changelog.patreon'), icon: <PatreonIcon /> },
  { href: ATLAS_GITHUB_URL, label: 'GitHub', icon: <GitHubIcon /> },
];

/** Icon links beside the close control; each opens in the system browser like any external link in Obsidian. */
export function HeaderLinks(): React.JSX.Element {
  return <>
    {links().map(link => <LabelTooltip key={link.href} label={link.label} side="bottom">
      <a className="atlas-changelog-header-link" href={link.href} target="_blank" rel="noopener noreferrer">
        {link.icon}
      </a>
    </LabelTooltip>)}
  </>;
}
