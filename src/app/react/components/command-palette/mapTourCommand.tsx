import React from 'react';
import { Compass } from 'lucide-react';
import { t } from '../../../i18n';
import type { CommandOption } from './types';

/** The palette's way to the map tour: it closes the palette, and the tour starts once the map is clear. */
export function mapTourCommand(replay: () => void, close: () => void): CommandOption {
  return {
    id: 'map-tour',
    icon: <Compass />,
    label: t('tour.replay'),
    keywords: ['tour', 'tutorial', 'onboarding', 'walkthrough', 'help', 'getting started', 'introduction'],
    section: 'tools',
    action: () => {
      close();
      replay();
    },
  };
}
