import { useCallback, useEffect, useState, type RefObject } from 'react';
import { t } from '../../../../i18n';
import { listView, type ListView } from '../../../../soundDirector/musicList';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { clock, POSITION_MS, writeText } from './musicClock';

function sameRows(a: ListView, b: ListView): boolean {
  return a.current === b.current && a.tracks.length === b.tracks.length && a.tracks.every((track, index) => track === b.tracks[index]);
}

/** The list as it plays: a list goes on by itself, so this follows the clock too. The time left goes straight to its element, and a render only comes with another row. */
export function useListView(director: SoundDirector, leftRef: RefObject<HTMLElement | null>): ListView {
  const read = useCallback((): ListView => {
    const { mix } = director.snapshot();
    return listView(mix.table, mix.listChange, director.now(), director.crossfadeMs());
  }, [director]);
  const [view, setView] = useState(read);
  useEffect(() => {
    const update = (): void => {
      const latest = read();
      writeText(leftRef.current, t('audio.timeLeft', { time: clock(latest.leftFrames) }));
      setView((shown) => (sameRows(shown, latest) ? shown : latest));
    };
    update();
    const timer = window.setInterval(update, POSITION_MS);
    const stop = director.subscribe(update);
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [director, leftRef, read]);
  return view;
}
