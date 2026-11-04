import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { Button } from '../packages/components/primitives/button';
import { CommunityLink } from './CommunityLink';
import { PreferenceToggle } from './PreferenceToggle';
import { ReleaseEntry } from './ReleaseEntry';
import type { ChangelogOptions } from './types';
import { t } from '../i18n';

interface Props extends Omit<ChangelogOptions, 'onClose'> {
  app: App;
  onCurrentRendered: () => void;
  onClose: () => void;
}

export function ChangelogContent(props: Props): React.JSX.Element {
  const [showOnUpdate, setShowOnUpdate] = useState(props.showOnUpdate);
  const [majorUpdatesOnly, setMajorUpdatesOnly] = useState(props.majorUpdatesOnly);
  const ignoreRendered = useCallback(() => {}, []);
  const history = useRef<HTMLDivElement>(null);
  // The scrollbar sits in the modal's right padding; its width is only known once rendered.
  useLayoutEffect(() => {
    const element = history.current;
    if (element) element.style.setProperty('--atlas-scrollbar-size', `${element.offsetWidth - element.clientWidth}px`);
  }, []);
  const [current, ...previous] = props.releases;
  const entry = (release: NonNullable<typeof current>, isCurrent: boolean): React.JSX.Element =>
    <ReleaseEntry key={release.version} release={release} app={props.app} isCurrent={isCurrent}
      isNew={props.newVersions.has(release.version)}
      onRendered={release.version === props.currentVersion ? props.onCurrentRendered : ignoreRendered} />;
  return <div className="atlas-changelog-content">
    <div ref={history} className="atlas-changelog-history">
      {current ? entry(current, true) : <p className="atlas-changelog-empty">{t('changelog.notBundled')}</p>}
      {previous.length > 0 && <section className="atlas-changelog-previous" aria-labelledby="atlas-changelog-previous-label">
        <p id="atlas-changelog-previous-label" className="atlas-changelog-section-label">{t('changelog.previous')}</p>
        {previous.map(release => entry(release, false))}
      </section>}
    </div>
    <CommunityLink />
    <div className="atlas-changelog-footer">
      <div className="atlas-changelog-preferences">
        <PreferenceToggle label={t('settings.updates.showAfterUpdates')} checked={showOnUpdate} onChange={checked => {
          setShowOnUpdate(checked);
          props.onPreferenceChange(checked);
        }} />
        <PreferenceToggle label={t('settings.updates.featureOnly')} checked={majorUpdatesOnly} disabled={!showOnUpdate}
          hint={t('settings.updates.featureOnlyDesc')} onChange={checked => {
            setMajorUpdatesOnly(checked);
            props.onMajorUpdatesChange(checked);
          }} />
      </div>
      <Button variant="outline" onClick={props.onClose}>{t('common.close')}</Button>
    </div>
  </div>;
}
