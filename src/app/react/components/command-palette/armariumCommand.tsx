import React from 'react';
import { Store } from 'lucide-react';
import { t } from '../../../i18n';
import type { CommandOption } from './types';

/** The palette's way to the Armarium: it opens the asset manager on the store and closes the palette. */
export function armariumCommand(open: () => void, close: () => void): CommandOption {
  return {
    id: 'open-armarium',
    icon: <Store />,
    label: t('armarium.title'),
    keywords: ['armarium', 'store', 'shop', 'library', 'collections', 'download', 'install', 'adventures', 'modules', 'community'],
    section: 'tools',
    action: () => {
      open();
      close();
    },
  };
}
