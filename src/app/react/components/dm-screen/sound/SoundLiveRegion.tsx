import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { t } from '../../../../i18n';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { useSoundValue } from './useSound';

interface Announcement {
  text: string;
  serial: number;
}

let current: Announcement = { text: '', serial: 0 };
const listeners = new Set<() => void>();

/** Says `text` to screen readers through the Sound page's polite live region, as an Obsidian notice shows it on screen. */
export function announceSound(text: string): void {
  current = { text, serial: current.serial + 1 };
  for (const listener of listeners) listener();
}

/**
 * The Sound page's polite live region: Stop all and Bring back from wherever they come (the button, ⌫, the palette),
 * and what `announceSound` is given. Each message is a new node, so a repeated one is read again.
 */
export function SoundLiveRegion({ director }: { director: SoundDirector }): React.JSX.Element {
  const stopped = useSoundValue(director, ({ mix }) => mix.table.silenced);
  const was = useRef(stopped);
  useEffect(() => {
    if (was.current === stopped) return;
    was.current = stopped;
    announceSound(stopped ? t('audio.announce.stopped') : t('audio.announce.broughtBack'));
  }, [stopped]);
  const announcement = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, () => current);
  return (
    <span className="atlas-sound-sr" role="status" aria-live="polite" aria-atomic="true">
      {announcement.text && <span key={announcement.serial}>{announcement.text}</span>}
    </span>
  );
}
