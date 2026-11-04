import React from 'react';
import { cn } from '../../../../utils/cn';
import { MAX_NUMBER_KEY } from './sceneSwitcherSearch';
import { t } from '../../../i18n';

interface SceneSwitcherFooterProps {
  /** Lifts the footer off the list while more maps are scrolled out of view below it. */
  isRaised: boolean;
}

interface KeyHint {
  keys: string;
  label: string;
}

const HINTS: readonly KeyHint[] = [
  { keys: '↑↓', label: t('switcher.navigate') },
  { keys: '↵', label: t('switcher.open') },
  { keys: 'shift ↵', label: t('switcher.openBoth') },
  { keys: `1–${MAX_NUMBER_KEY}`, label: t('switcher.jump') },
  { keys: 'esc', label: t('common.close') },
];

/** One line of keyboard hints. */
export function SceneSwitcherFooter({ isRaised }: SceneSwitcherFooterProps): React.ReactElement {
  return (
    <div className={cn('atlas-scene-switcher__footer', isRaised && 'atlas-scene-switcher__footer--raised')}>
      {HINTS.map((hint) => (
        <span key={hint.keys} className="atlas-scene-switcher__hint">
          <kbd>{hint.keys}</kbd>
          {hint.label}
        </span>
      ))}
    </div>
  );
}
