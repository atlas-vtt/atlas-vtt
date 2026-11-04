import React, { useId, useState } from 'react';
import type { App } from 'obsidian';
import { ChevronDown } from 'lucide-react';
import { Button } from '../packages/components/primitives/button';
import { ReleaseMarkdown } from './ReleaseMarkdown';
import type { ReleaseNote } from './types';
import { isReleaseVersion } from './version';
import { getLocale, t } from '../i18n';

interface Props {
  release: ReleaseNote;
  app: App;
  /** The installed release: opens by default and is styled as the headline entry. */
  isCurrent: boolean;
  isNew: boolean;
  onRendered: () => void;
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(getLocale(), {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Collapsible release card. Notes render on first expansion and stay mounted so reopening never reflows. */
export function ReleaseEntry({ release, app, isCurrent, isNew, onRendered }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(isCurrent);
  const [opened, setOpened] = useState(isCurrent);
  const id = useId();
  const toggle = (): void => {
    setExpanded(!expanded);
    setOpened(true);
  };
  return <article className="atlas-changelog-entry" data-expanded={expanded} data-current={isCurrent || undefined}>
    <h3 className="atlas-changelog-heading">
      <Button variant="ghost" className="atlas-changelog-trigger" aria-expanded={expanded}
        aria-controls={`${id}-panel`} id={`${id}-heading`} onClick={toggle}>
        <span className="atlas-changelog-release-label">
          <span className="atlas-changelog-meta">
            <span className="atlas-changelog-version-chip">{release.version}</span>
            {!isReleaseVersion(release.version) && <span className="atlas-changelog-badge atlas-changelog-badge--beta">{t('changelog.beta')}</span>}
            {isNew && <span className="atlas-changelog-badge atlas-changelog-badge--new">{t('changelog.new')}</span>}
            {release.date && <time dateTime={release.date}>{formatDate(release.date)}</time>}
          </span>
          <span className="atlas-changelog-release-title">{release.title}</span>
        </span>
        <ChevronDown aria-hidden="true" className="atlas-changelog-chevron" />
      </Button>
    </h3>
    <div id={`${id}-panel`} aria-labelledby={`${id}-heading`} className="atlas-changelog-panel"
      data-expanded={expanded} aria-hidden={!expanded} inert={!expanded}>
      <div className="atlas-changelog-panel-inner">
        <div className="atlas-changelog-panel-body">
          {opened && <ReleaseMarkdown app={app} markdown={release.markdown} onRendered={onRendered} />}
        </div>
      </div>
    </div>
  </article>;
}
