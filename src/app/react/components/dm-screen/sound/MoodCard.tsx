import React, { useEffect, useRef } from 'react';
import { CornerDownLeft, MoreHorizontal } from 'lucide-react';
import { t } from '../../../../i18n';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { Mood } from '../../../../sound/soundTypes';
import type { MoodProblem } from '../../../../soundDirector/moodReadiness';
import type { PlayersCopy } from '../../../../soundDirector/tableClock';
import { moodIcon, moodTone } from '../../../../soundLibrary/moodLook';
import { PIN_ICON_PATHS } from '../../../../types/pinIcons';
import { WIDGET_ICON_VIEW_BOX } from '../../../../types/widgetIcons';
import { prefersReducedMotion } from '../../../../utils/motion';
import { IconAction } from './IconAction';
import { MoodPlayersTag } from './PlayersRow';
import { MoodBars } from './MoodBars';

interface MoodCardProps {
  mood: Mood;
  /** Its place in the row; only the first ten have a key. */
  number: number;
  playing: boolean;
  silenced: boolean;
  next: boolean;
  dragging: boolean;
  /** The first track of its list. */
  musicName: string | null;
  problems: readonly MoodProblem[];
  /** How the mood stands for players at a table online; null without one. */
  players: PlayersCopy | null;
  onPress: (mood: Mood) => void;
  onMenu: (mood: Mood, anchor: HTMLElement) => void;
  onDragStart: (mood: Mood, event: React.PointerEvent<HTMLElement>) => void;
}

function problemText(problem: MoodProblem): string {
  switch (problem.kind) {
    case 'deleted': return t('audio.problem.deleted');
    case 'missing': return t('audio.problem.missing', { name: problem.name });
    case 'converting': return t('audio.problem.converting', { name: problem.name });
    case 'notConverted': return t('audio.problem.notConverted', { name: problem.name });
    case 'refused': return t('audio.problem.refused', { name: problem.name, reason: t(`audio.refused.${problem.reason}`) });
  }
}

function keyOf(number: number): string | null {
  if (number < 10) return String(number);
  return number === 10 ? '0' : null;
}

function musicLine(mood: Mood, musicName: string | null): string {
  if (mood.music === 'keep') return t('audio.mood.musicKeep');
  if (mood.music !== 'none' && mood.music.tracks.length > 0) return musicName ?? t('audio.music');
  return mood.layers.length > 0 ? t('audio.ambienceOnly') : t('audio.mood.noSounds');
}

/** The crossfade under way, along the tile's foot. A page that opens on a mood already playing shows none. */
function FadeBar({ playing, seconds }: { playing: boolean; seconds: number }): React.JSX.Element {
  const bar = useRef<HTMLSpanElement>(null);
  const was = useRef(playing);
  useEffect(() => {
    const element = bar.current;
    const started = playing && !was.current;
    was.current = playing;
    if (!element || !started || seconds <= 0 || prefersReducedMotion(element)) return;
    element.animate(
      [{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.98 }, { transform: 'scaleX(1)', opacity: 0 }],
      { duration: seconds * 1000, easing: 'linear' },
    );
  }, [playing, seconds]);
  return <span className="atlas-sound-mood__fade" ref={bar} />;
}

function ProblemLine({ moodId, problems }: { moodId: string; problems: readonly MoodProblem[] }): React.JSX.Element {
  const stillComing = problems.every((problem) => problem.kind === 'converting' || problem.kind === 'notConverted');
  return (
    <LabelTooltip label={problems.map(problemText).join('\n')} multiline describe>
      <span className="atlas-sound-mood__state atlas-sound-mood__state--problem" data-sound-problem={moodId}>
        {t(stillComing ? 'audio.stillConverting' : 'audio.notReady', { count: problems.length })}
      </span>
    </LabelTooltip>
  );
}

/** A mood in its fixed place: one press changes the room. */
export const MoodCard = React.memo(function MoodCard({ mood, number, playing, silenced, next, dragging, musicName, problems, players, onPress, onMenu, onDragStart }: MoodCardProps): React.JSX.Element {
  const tone = moodTone(mood);
  const key = keyOf(number);
  const hasList = mood.music !== 'none' && mood.music !== 'keep' && mood.music.tracks.length > 0;
  return (
    <div
      className="atlas-sound-mood"
      data-playing={playing || undefined}
      data-dragging={dragging || undefined}
      style={{ '--atlas-sound-tone-light': tone.light, '--atlas-sound-tone-dark': tone.dark } as React.CSSProperties}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(mood, event.currentTarget);
      }}
    >
      <button
        type="button"
        className="atlas-sound-mood__press"
        data-sound-mood={mood.id}
        aria-pressed={playing}
        onClick={() => onPress(mood)}
        onPointerDown={(event) => onDragStart(mood, event)}
      >
        <svg className="atlas-sound-mood__crest" viewBox={WIDGET_ICON_VIEW_BOX} aria-hidden="true"><path d={PIN_ICON_PATHS[moodIcon(mood)]} /></svg>
        <span className="atlas-sound-mood__name">{mood.name}</span>
        <span className="atlas-sound-mood__what">
          <span>{musicLine(mood, musicName)}</span>
          {hasList && mood.layers.length > 0 && <span>{t('audio.ambienceCount', { count: mood.layers.length })}</span>}
        </span>
        <span className="atlas-sound-mood__foot">
          {key !== null && <span className="atlas-sound-cap">{key}</span>}
          {playing && <MoodBars />}
          {playing && <span className="atlas-sound-mood__state">{silenced ? t('audio.silenced') : t('audio.playingTag')}</span>}
          {next && !playing && <span className="atlas-sound-cap"><CornerDownLeft aria-hidden="true" /></span>}
          {next && !playing && <span className="atlas-sound-mood__state">{t('audio.nextTag')}</span>}
          {problems.length > 0 && <ProblemLine moodId={mood.id} problems={problems} />}
          {players !== null && <MoodPlayersTag copy={players} />}
        </span>
        <FadeBar playing={playing} seconds={mood.fadeSeconds} />
      </button>
      <IconAction label={t('audio.moodMenu', { name: mood.name })} icon={MoreHorizontal} className="atlas-sound-mood__menu" focusSkip onClick={(event) => onMenu(mood, event.currentTarget)} />
    </div>
  );
});
