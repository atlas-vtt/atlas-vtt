import React from 'react';
import { t } from '../../../../i18n';

const SOURCES = [
  { href: 'https://incompetech.com/music/royalty-free/faq.html', label: t('audio.empty.incompetech') },
  { href: 'https://freesound.org/help/faq/', label: t('audio.empty.freesound') },
  { href: 'https://tabletopaudio.com/about.html', label: t('audio.empty.tabletopAudio') },
];

/** What the Moods side shows while a collection has none: one line, and where sounds can be had. */
export function SoundSources(): React.JSX.Element {
  return (
    <div className="atlas-sound-empty">
      <p>{t('audio.empty.moods')}</p>
      <p>{t('audio.empty.sources')}</p>
      <ul>
        {SOURCES.map(({ href, label }) => <li key={href}><a href={href} target="_blank" rel="noopener noreferrer" className="external-link">{label}</a></li>)}
      </ul>
    </div>
  );
}
