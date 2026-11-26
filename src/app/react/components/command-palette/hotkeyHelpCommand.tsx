import React from 'react';
import { Keyboard } from 'lucide-react';
import { t } from '../../../i18n';
import type { CommandOption } from './types';

/** The palette's way to the keyboard shortcuts cheat sheet: it opens the sheet in this view and closes the palette. */
export function hotkeyHelpCommand(open: () => void, close: () => void, shortcut: string): CommandOption {
  return {
    id: 'keyboard-shortcuts',
    icon: <Keyboard />,
    label: t('hotkey.help'),
    keywords: ['hotkeys', 'shortcuts', 'keys', 'cheat sheet', 'help', 'keyboard'],
    shortcut,
    section: 'tools',
    action: () => {
      open();
      close();
    },
  };
}
